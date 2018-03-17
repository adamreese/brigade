/**
 * k8s contains the Kubernetes implementation of Brigade.
 */

/** */

import * as kubernetes from "@kubernetes/typescript-node";
import { BrigadeEvent, Project } from "./events";
import * as jobs from "./job";
import { ContextLogger, Logger } from "./logger";

// The internals for running tasks. This must be loaded before any of the
// objects that use run().
//
// All Kubernetes API calls should be localized here. Other modules should not
// call 'kubernetes' directly.

// expiresInMSec is the number of milliseconds until pod expiration
// After this point, the pod can be garbage collected (a feature not yet implemented)
const expiresInMSec = 1000 * 60 * 60 * 24 * 30;

const defaultClient = kubernetes.Config.defaultClient();

const logger = new ContextLogger("k8s");

/**
 * options is the set of configuration options for the library.
 *
 * The k8s library provides a backend for the brigade.js objects. But it needs
 * some configuration that is to be passed directly to the library, not via the
 * brigade.js. To allow for this plus overrides (e.g. by Project or Job objects),
 * we maintain a top-level singleton object that holds configuration.
 *
 * It is initially populated with defaults. The defaults can be overridden first
 * by the app (app.ts), then by the project (where allowed). Certain jobs may be
 * allowed to override (or ignore) 'options', though they should never modify
 * it.
 */
export const options: KubernetesOptions = {
  mountPath: "/src",
  serviceAccount: "brigade-worker"
};

/**
 * KubernetesOptions exposes options for Kubernetes configuration.
 */
export class KubernetesOptions {
  public serviceAccount: string;
  public mountPath: string;
}

class K8sResult implements jobs.Result {
  public data: string;
  constructor(msg: string) {
    this.data = msg;
  }
  public toString(): string {
    return this.data;
  }
}

/**
 * BuildStorage manages per-build storage for a build.
 *
 * BuildStorage implements the app.BuildStorage interface.
 *
 * Storage is implemented as a PVC. The PVC backing it MUST be ReadWriteMany.
 */
export class BuildStorage {
  public proj: Project;
  public name: string;
  public build: string;

  /**
   * create initializes a new PVC for storing data.
   */
  public create(
    e: BrigadeEvent,
    project: Project,
    size: string
  ): Promise<string> {
    this.proj = project;
    this.name = e.workerID.toLowerCase();
    this.build = e.buildID;
    const pvc = this.buildPVC(size);
    logger.log(`Creating PVC named ${this.name}`);
    return defaultClient
      .createNamespacedPersistentVolumeClaim(
        this.proj.kubernetes.namespace,
        pvc
      )
      .then(() => {
        return this.name;
      });
  }
  /**
   * destroy deletes the PVC.
   */
  public destroy(): Promise<boolean> {
    logger.log(`Destroying PVC named ${this.name}`);
    const opts = new kubernetes.V1DeleteOptions();
    return defaultClient
      .deleteNamespacedPersistentVolumeClaim(
        this.name,
        this.proj.kubernetes.namespace,
        opts
      )
      .then(() => {
        return true;
      });
  }
  /**
   * Get a PVC for a volume that lives for the duration of a build.
   */
  protected buildPVC(size: string): kubernetes.V1PersistentVolumeClaim {
    const s = new kubernetes.V1PersistentVolumeClaim();
    s.metadata = new kubernetes.V1ObjectMeta();
    s.metadata.name = this.name;
    s.metadata.labels = {
      build: this.build,
      component: "buildStorage",
      heritage: "brigade",
      project: this.proj.id,
      worker: this.name
    };

    s.spec = new kubernetes.V1PersistentVolumeClaimSpec();
    s.spec.accessModes = ["ReadWriteMany"];

    const res = new kubernetes.V1ResourceRequirements();
    res.requests = { storage: size };
    s.spec.resources = res;
    if (this.proj.kubernetes.buildStorageClass.length > 0) {
      s.spec.storageClassName = this.proj.kubernetes.buildStorageClass;
    }

    return s;
  }
}

/**
 * loadProject takes a Secret name and namespace and loads the Project
 * from the secret.
 */
export function loadProject(name: string, ns: string): Promise<Project> {
  return defaultClient
    .readNamespacedSecret(name, ns)
    .catch(reason => {
      const msg = reason.body ? reason.body.message : reason;
      return Promise.reject(new Error(`Project not found: ${msg}`));
    })
    .then(result => {
      return secretToProject(ns, result.body);
    });
}

/**
 * JobRunner provides a Kubernetes implementation of the JobRunner interface.
 */
export class JobRunner implements jobs.JobRunner {
  public name: string;
  public secret: kubernetes.V1Secret;
  public runner: kubernetes.V1Pod;
  public pvc: kubernetes.V1PersistentVolumeClaim;
  public project: Project;
  public event: BrigadeEvent;
  public job: jobs.Job;
  public client: kubernetes.Core_v1Api;
  public options: KubernetesOptions;
  public serviceAccount: string;

  constructor(job: jobs.Job, e: BrigadeEvent, project: Project) {
    this.options = Object.assign({}, options);

    this.event = e;
    this.job = job;
    this.project = project;
    this.client = defaultClient;
    this.serviceAccount = job.serviceAccount || this.options.serviceAccount;

    // $JOB-$BUILD
    this.name = `${job.name}-${this.event.buildID}`;
    const commit = e.revision.commit || "master";
    const secName = this.name;
    const runnerName = this.name;

    this.secret = newSecret(secName);
    this.runner = newRunnerPod(
      runnerName,
      job.image,
      job.imageForcePull,
      this.serviceAccount
    );

    // Experimenting with setting a deadline field after which something
    // can clean up existing builds.
    const expiresAt = Date.now() + expiresInMSec;

    this.runner.metadata.labels.jobname = job.name;
    this.runner.metadata.labels.project = project.id;
    this.runner.metadata.labels.worker = e.workerID;
    this.runner.metadata.labels.build = e.buildID;

    this.secret.metadata.labels.jobname = job.name;
    this.secret.metadata.labels.project = project.id;
    this.secret.metadata.labels.expires = String(expiresAt);
    this.secret.metadata.labels.worker = e.workerID;
    this.secret.metadata.labels.build = e.buildID;

    const envVars: kubernetes.V1EnvVar[] = [];
    for (const key in job.env) {
      const val = job.env[key];
      this.secret.data[key] = b64enc(val);

      // Add reference to pod
      envVars.push({
        name: key,
        valueFrom: {
          secretKeyRef: {
            key: key,
            name: secName
          }
        }
      } as kubernetes.V1EnvVar);
    }

    this.runner.spec.containers[0].env = envVars;

    const mountPath = job.mountPath || this.options.mountPath;

    // Add secret volume
    this.runner.spec.volumes = [
      { name: secName, secret: { secretName: secName } } as kubernetes.V1Volume,
      { name: "vcs-sidecar", emptyDir: {} } as kubernetes.V1Volume
    ];
    this.runner.spec.containers[0].volumeMounts = [
      { name: secName, mountPath: "/hook" } as kubernetes.V1VolumeMount,
      {
        name: "vcs-sidecar",
        mountPath: `${mountPath}`
      } as kubernetes.V1VolumeMount
    ];

    if (job.useSource && project.repo.cloneURL) {
      // Add the sidecar.
      const sidecar = sidecarSpec(
        e,
        "/src",
        project.kubernetes.vcsSidecar,
        project
      );
      this.runner.spec.initContainers = [sidecar];
    }

    if (job.imagePullSecrets) {
      this.runner.spec.imagePullSecrets = [];
      for (const secret of job.imagePullSecrets) {
        this.runner.spec.imagePullSecrets.push({ name: secret });
      }
    }

    // If host os is set, specify it.
    if (job.host.os) {
      this.runner.spec.nodeSelector = {
        "beta.kubernetes.io/os": job.host.os
      };
    }
    if (job.host.name) {
      this.runner.spec.nodeName = job.host.name;
    }
    if (job.host.nodeSelector && job.host.nodeSelector.size > 0) {
      if (!this.runner.spec.nodeSelector) {
        this.runner.spec.nodeSelector = {};
      }
      for (const k of job.host.nodeSelector.keys()) {
        this.runner.spec.nodeSelector[k] = job.host.nodeSelector.get(k);
      }
    }

    // If the job requests a cache, set up the cache.
    if (job.cache.enabled) {
      this.pvc = this.cachePVC();

      // Now add volume mount to pod:
      const mountName = this.cacheName();
      this.runner.spec.volumes.push({
        name: mountName,
        persistentVolumeClaim: { claimName: mountName }
      } as kubernetes.V1Volume);
      const mnt = volumeMount(mountName, job.cache.path);
      this.runner.spec.containers[0].volumeMounts.push(mnt);
    }

    // If the job needs build-wide storage, enable it.
    if (job.storage.enabled) {
      const vname = "build-storage";
      this.runner.spec.volumes.push({
        name: vname,
        persistentVolumeClaim: { claimName: e.workerID.toLowerCase() }
      } as kubernetes.V1Volume);
      const mnt = volumeMount(vname, job.storage.path);
      this.runner.spec.containers[0].volumeMounts.push(mnt);
    }

    // If the job needs access to a docker daemon, mount in the host's docker socket
    if (job.docker.enabled && project.allowHostMounts) {
      const dockerVol = new kubernetes.V1Volume();
      const dockerMount = new kubernetes.V1VolumeMount();
      const hostPath = new kubernetes.V1HostPathVolumeSource();
      hostPath.path = jobs.dockerSocketMountPath;
      dockerVol.name = jobs.dockerSocketMountName;
      dockerVol.hostPath = hostPath;
      dockerMount.name = jobs.dockerSocketMountName;
      dockerMount.mountPath = jobs.dockerSocketMountPath;
      this.runner.spec.volumes.push(dockerVol);
      for (const c of this.runner.spec.containers) {
        c.volumeMounts.push(dockerMount);
      }
    }

    const newCmd = generateScript(job);
    if (!newCmd) {
      this.runner.spec.containers[0].command = null;
    } else {
      this.secret.data["main.sh"] = b64enc(newCmd);
    }

    // If the job askes for privileged mode and the project allows this, enable it.
    if (job.privileged && project.allowPrivilegedJobs) {
      for (const c of this.runner.spec.containers) {
        c.securityContext.privileged = true;
      }
    }
  }

  /**
   * cacheName returns the name of this job's cache PVC.
   */
  protected cacheName(): string {
    // The Kubernetes rules on pvc names are stupid^b^b^b^b strict. Name must
    // be DNS-like, and less than 64 chars. This rules out using project ID,
    // project name, etc. For now, we use project name with slashes replaced,
    // appended to job name.
    return `${this.project.name.replace(/[.\/]/g, "-")}-${
      this.job.name
    }`.toLowerCase();
  }

  /**
   * run starts a job and then waits until it is running.
   *
   * The Promise it returns will return when the pod is either marked
   * Success (resolve) or Failure (reject)
   */
  public run(): Promise<jobs.Result> {
    const podName = this.name;
    const k = this.client;
    const ns = this.project.kubernetes.namespace;
    return this.start()
      .then(r => r.wait())
      .then(r => {
        return k.readNamespacedPodLog(podName, ns);
      })
      .then(response => {
        return new K8sResult(response.body);
      });
  }

  /**
   * start begins a job, and returns once it is scheduled to run.
   */
  public start(): Promise<jobs.JobRunner> {
    // Now we have pod and a secret defined. Time to create them.

    const ns = this.project.kubernetes.namespace;
    const k = this.client;
    const pvcPromise = this.checkOrCreateCache();

    return new Promise((resolve, reject) => {
      pvcPromise
        .then(() => {
          logger.log("Creating secret " + this.secret.metadata.name);
          return k.createNamespacedSecret(ns, this.secret);
        })
        .then(result => {
          logger.log("Creating pod " + this.runner.metadata.name);
          // Once namespace creation has been accepted, we create the pod.
          return k.createNamespacedPod(ns, this.runner);
        })
        .then(result => {
          resolve(this);
        })
        .catch(reason => {
          logger.error(reason);
          reject(reason);
        });
    });
  }

  /**
   * checkOrCreateCache handles creating the cache if necessary.
   *
   * If no cache is requested by the job, this is a no-op.
   *
   * Otherwise, this checks for a cache, and if not found, it creates one.
   */
  protected checkOrCreateCache(): Promise<string> {
    return new Promise((resolve, reject) => {
      const ns = this.project.kubernetes.namespace;
      const k = this.client;
      if (!this.pvc) {
        resolve("no cache requested");
      } else {
        const cname = this.cacheName();
        logger.log(`looking up ${ns}/${cname}`);
        k
          .readNamespacedPersistentVolumeClaim(cname, ns)
          .then(result => {
            resolve("re-using existing cache");
          })
          .catch(result => {
            // TODO: check if cache exists.
            logger.log(`Creating Job Cache PVC ${cname}`);
            return k
              .createNamespacedPersistentVolumeClaim(ns, this.pvc)
              .then((result, newPVC) => {
                logger.log("created cache");
                resolve("created job cache");
              });
          })
          .catch(err => {
            logger.error(err);
            reject(err);
          });
      }
    });
  }

  /**
   * wait listens for the running job to complete.
   */
  public wait(): Promise<jobs.Result> {
    // Should probably protect against the case where start() was not called
    const k = this.client;
    const timeout = this.job.timeout || 60000;
    const name = this.name;
    const ns = this.project.kubernetes.namespace;
    let cancel = false;

    // This is a handle to clear the setTimeout when the promise is fulfilled.
    let waiter;

    logger.log(`Timeout set at ${timeout}`);

    // At intervals, poll the Kubernetes server and get the pod phase. If the
    // phase is Succeeded or Failed, bail out. Otherwise, keep polling.
    //
    // The timeout sets an upper limit, and if that limit is reached, the
    // polling will be stopped.
    //
    // Essentially, we track two Timer objects: the setTimeout and the setInterval.
    // That means we have to kill both before exit, otherwise the node.js process
    // will remain running until all timeouts have executed.

    // Poll the server waiting for a Succeeded.
    const poll = new Promise((resolve, reject) => {
      const pollOnce = (name, ns, i) => {
        k
          .readNamespacedPod(name, ns)
          .then(response => {
            const pod = response.body;
            if (pod.status === undefined) {
              logger.log("Pod not yet scheduled");
              return;
            }
            const phase = pod.status.phase;
            if (phase === "Succeeded") {
              clearTimers();
              const result = new K8sResult(phase);
              resolve(result);
            } else if (phase === "Failed") {
              clearTimers();
              reject(new Error(`Pod ${name} failed to run to completion`));
            } else if (phase === "Pending") {
              // Trap image pull errors and consider them fatal.
              const cs = pod.status.containerStatuses;
              if (
                cs &&
                cs.length > 0 &&
                cs[0].state.waiting &&
                cs[0].state.waiting.reason === "ErrImagePull"
              ) {
                k
                  .deleteNamespacedPod(
                    name,
                    ns,
                    new kubernetes.V1DeleteOptions()
                  )
                  .catch(e => logger.error(e));
                clearTimers();
                reject(new Error(cs[0].state.waiting.message));
              }
            }
            logger.log(
              `${pod.metadata.namespace}/${pod.metadata.name} phase ${
                pod.status.phase
              }`
            );
            // In all other cases we fall through and let the fn be run again.
          })
          .catch(reason => {
            logger.error("failed pod lookup");
            logger.error(reason);
            clearTimers();
            reject(reason);
          });
      };
      const interval = setInterval(() => {
        if (cancel) {
          clearInterval(interval);
          clearTimeout(waiter);
          return;
        }
        pollOnce(name, ns, interval);
      }, 2000);
      const clearTimers = () => {
        clearInterval(interval);
        clearTimeout(waiter);
      };
    });

    // This will fail if the timelimit is reached.
    const timer = new Promise((solve, reject) => {
      waiter = setTimeout(() => {
        cancel = true;
        reject("time limit exceeded");
      }, timeout);
    });

    return Promise.race([poll, timer]);
  }
  /**
   * cachePVC builds a persistent volume claim for storing a job's cache.
   *
   * A cache PVC persists between builds. So this is addressable as a Job on a Project.
   */
  protected cachePVC(): kubernetes.V1PersistentVolumeClaim {
    const s = new kubernetes.V1PersistentVolumeClaim();
    s.metadata = new kubernetes.V1ObjectMeta();
    s.metadata.name = this.cacheName();
    s.metadata.labels = {
      component: "jobCache",
      heritage: "brigade",
      job: this.job.name,
      project: this.project.id
    };

    s.spec = new kubernetes.V1PersistentVolumeClaimSpec();
    s.spec.accessModes = ["ReadWriteMany"];
    if (
      this.project.kubernetes.cacheStorageClass &&
      this.project.kubernetes.cacheStorageClass.length > 0
    ) {
      s.spec.storageClassName = this.project.kubernetes.cacheStorageClass;
    }
    const res = new kubernetes.V1ResourceRequirements();
    res.requests = { storage: this.job.cache.size };
    s.spec.resources = res;

    return s;
  }
}

function sidecarSpec(
  e: BrigadeEvent,
  local: string,
  image: string,
  project: Project
): kubernetes.V1Container {
  let imageTag = image;
  const initGitSubmodules = project.repo.initGitSubmodules;

  if (!imageTag) {
    imageTag = "deis/git-sidecar:latest";
  }

  const spec = new kubernetes.V1Container();
  (spec.name = "vcs-sidecar"),
    (spec.env = [
      envVar("CI", "true"),
      envVar("BRIGADE_BUILD_ID", e.buildID),
      envVar("BRIGADE_COMMIT_ID", e.revision.commit),
      envVar("BRIGADE_COMMIT_REF", e.revision.ref),
      envVar("BRIGADE_EVENT_PROVIDER", e.provider),
      envVar("BRIGADE_EVENT_TYPE", e.type),
      envVar("BRIGADE_PROJECT_ID", project.id),
      envVar("BRIGADE_REMOTE_URL", project.repo.cloneURL),
      envVar("BRIGADE_WORKSPACE", local),
      envVar("BRIGADE_PROJECT_NAMESPACE", project.kubernetes.namespace),
      envVar("BRIGADE_SUBMODULES", initGitSubmodules.toString())
    ]);
  spec.image = imageTag;
  (spec.imagePullPolicy = "IfNotPresent"),
    (spec.volumeMounts = [volumeMount("vcs-sidecar", local)]);

  if (project.repo.sshKey) {
    spec.env.push({
      name: "BRIGADE_REPO_KEY",
      valueFrom: {
        secretKeyRef: {
          key: "sshKey",
          name: project.id
        }
      }
    } as kubernetes.V1EnvVar);
  }

  if (project.repo.token) {
    spec.env.push({
      name: "BRIGADE_REPO_AUTH_TOKEN",
      valueFrom: {
        secretKeyRef: {
          key: "github.token",
          name: project.id
        }
      }
    } as kubernetes.V1EnvVar);
  }

  return spec;
}

function newRunnerPod(
  podname: string,
  brigadeImage: string,
  imageForcePull: boolean,
  serviceAccount: string
): kubernetes.V1Pod {
  const pod = new kubernetes.V1Pod();
  pod.metadata = new kubernetes.V1ObjectMeta();
  pod.metadata.name = podname;
  pod.metadata.labels = {
    component: "job",
    heritage: "brigade"
  };

  const c1 = new kubernetes.V1Container();
  c1.name = "brigaderun";
  c1.image = brigadeImage;
  c1.command = ["/bin/sh", "/hook/main.sh"];
  c1.imagePullPolicy = imageForcePull ? "Always" : "IfNotPresent";
  c1.securityContext = new kubernetes.V1SecurityContext();

  pod.spec = new kubernetes.V1PodSpec();
  pod.spec.containers = [c1];
  pod.spec.restartPolicy = "Never";
  pod.spec.serviceAccount = serviceAccount;
  pod.spec.serviceAccountName = serviceAccount;
  return pod;
}

function newSecret(name: string): kubernetes.V1Secret {
  const s = new kubernetes.V1Secret();
  s.type = "brigade.sh/job";
  s.metadata = new kubernetes.V1ObjectMeta();
  s.metadata.name = name;
  s.metadata.labels = {
    component: "job",
    heritage: "brigade"
  };
  s.data = {}; // {"main.sh": b64enc("echo hello && echo goodbye")}

  return s;
}

function envVar(key: string, value: string): kubernetes.V1EnvVar {
  const e = new kubernetes.V1EnvVar();
  e.name = key;
  e.value = value;
  return e;
}

function volumeMount(
  name: string,
  mountPath: string
): kubernetes.V1VolumeMount {
  const v = new kubernetes.V1VolumeMount();
  v.name = name;
  v.mountPath = mountPath;
  return v;
}

export function b64enc(original: string): string {
  return Buffer.from(original).toString("base64");
}

export function b64dec(encoded: string): string {
  return Buffer.from(encoded, "base64").toString("utf8");
}

function generateScript(job: jobs.Job): string | null {
  if (job.tasks.length === 0) {
    return null;
  }
  let newCmd = "#!" + job.shell + "\n\n";

  // if shells that support the `set` command are selected, let's add some sane defaults
  if (job.shell === "/bin/sh" || job.shell === "/bin/bash") {
    newCmd += "set -e\n\n";
  }

  // Join the tasks to make a new command:
  if (job.tasks) {
    newCmd += job.tasks.join("\n");
  }
  return newCmd;
}

/**
 * secretToProject transforms a properly formatted Secret into a Project.
 *
 * This is exported for testability, and is not considered part of the stable API.
 */
export function secretToProject(
  ns: string,
  secret: kubernetes.V1Secret
): Project {
  const p: Project = {
    allowHostMounts: false,
    allowPrivilegedJobs: true,
    id: secret.metadata.name,
    kubernetes: {
      buildStorageClass: "",
      buildStorageSize: "50Mi",
      cacheStorageClass: "",
      namespace: secret.metadata.namespace || ns,
      vcsSidecar: ""
    },
    name: b64dec(secret.data.repository),
    repo: {
      cloneURL: null,
      initGitSubmodules: false,
      name: secret.metadata.annotations.projectName
    },
    secrets: {}
  };
  if (secret.data.vcsSidecar) {
    p.kubernetes.vcsSidecar = b64dec(secret.data.vcsSidecar);
  }
  if (secret.data.buildStorageSize) {
    p.kubernetes.buildStorageSize = b64dec(secret.data.buildStorageSize);
  }
  if (secret.data.cloneURL) {
    p.repo.cloneURL = b64dec(secret.data.cloneURL);
  }
  if (secret.data.initGitSubmodules) {
    p.repo.initGitSubmodules = b64dec(secret.data.initGitSubmodules) === "true";
  }
  if (secret.data.secrets) {
    p.secrets = JSON.parse(b64dec(secret.data.secrets));
  }
  if (secret.data.allowPrivilegedJobs) {
    p.allowPrivilegedJobs = b64dec(secret.data.allowPrivilegedJobs) === "true";
  }
  if (secret.data.allowHostMounts) {
    p.allowHostMounts = b64dec(secret.data.allowHostMounts) === "true";
  }
  if (secret.data.sshKey) {
    p.repo.sshKey = b64dec(secret.data.sshKey);
  }
  if (secret.data["github.token"]) {
    p.repo.token = b64dec(secret.data["github.token"]);
  }
  if (secret.data["kubernetes.cacheStorageClass"]) {
    p.kubernetes.cacheStorageClass = b64dec(
      secret.data["kubernetes.cacheStorageClass"]
    );
  }
  if (secret.data["kubernetes.buildStorageClass"]) {
    p.kubernetes.buildStorageClass = b64dec(
      secret.data["kubernetes.buildStorageClass"]
    );
  }
  return p;
}
