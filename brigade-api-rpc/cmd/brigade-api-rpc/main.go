package main

import (
	"errors"
	"flag"
	"log"
	"net"
	"os"
	"time"

	"github.com/deis/brigade/pkg/brigade"
	"github.com/deis/brigade/pkg/brigade/pb"
	"github.com/deis/brigade/pkg/storage"
	"github.com/deis/brigade/pkg/storage/kube"

	"github.com/golang/protobuf/ptypes"
	"google.golang.org/grpc"
	meta "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/labels"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/pkg/api/v1"
)

const port = ":50051"

type server struct {
	client kubernetes.Interface
	store  storage.Store
}

func (s *server) CreateBuild(build *pb.Build, stream pb.Brigade_CreateBuildServer) (err error) {
	b := pb.BrigadeBuild(build)

	if err = s.store.CreateBuild(&b); err != nil {
		return err
	}
	log.Printf("created build %s", b.ID)

	labels := labels.Set{"heritage": "brigade", "component": "build", "build": b.ID}
	listOption := meta.ListOptions{LabelSelector: labels.AsSelector().String()}

	w, err := s.client.CoreV1().Pods(namespace).Watch(listOption)
	if err != nil {
		return err
	}
	defer w.Stop()

	for {
		select {
		case <-time.After(30 * time.Second):
			return errors.New("timeout")
		case event := <-w.ResultChan():
			pod, ok := event.Object.(*v1.Pod)
			if !ok {
				continue
			}

			status, err := getBuildStatusFromPod(&b, pod)
			if err != nil {
				return err
			}
			stream.Send(status)

			switch pod.Status.Phase {
			case v1.PodSucceeded, v1.PodFailed:
				return nil
			}
		}
	}
}

func jobStatus(phase v1.PodPhase) pb.JobStatus {
	switch phase {
	case v1.PodPending:
		return pb.JobStatus_PENDING
	case v1.PodSucceeded:
		return pb.JobStatus_SUCCEEDED
	case v1.PodFailed:
		return pb.JobStatus_FAILED
	case v1.PodRunning:
		return pb.JobStatus_RUNNING
	}
	return pb.JobStatus_UNKNOWN
}

func getBuildStatusFromPod(b *brigade.Build, pod *v1.Pod) (*pb.BuildStatus, error) {
	bs := &pb.BuildStatus{
		BuildId: b.ID,
		Status:  jobStatus(pod.Status.Phase),
	}

	var err error
	if bs.CreationTime, err = ptypes.TimestampProto(pod.ObjectMeta.CreationTimestamp.Time); err != nil {
		return nil, err
	}

	if len(pod.Status.ContainerStatuses) == 0 {
		return bs, nil
	}

	if podState := pod.Status.ContainerStatuses[0].State.Running; podState != nil {
		if bs.StartTime, err = ptypes.TimestampProto(podState.StartedAt.Time); err != nil {
			return nil, err
		}
	}

	if podState := pod.Status.ContainerStatuses[0].State.Terminated; podState != nil {
		if bs.EndTime, err = ptypes.TimestampProto(podState.FinishedAt.Time); err != nil {
			return nil, err
		}
		if bs.StartTime, err = ptypes.TimestampProto(podState.StartedAt.Time); err != nil {
			return nil, err
		}
		bs.ExitCode = podState.ExitCode
	}
	return bs, nil
}

var (
	kubeconfig string
	namespace  string
)

func init() {
	flag.StringVar(&kubeconfig, "kubeconfig", "", "absolute path to the kubeconfig file")
	flag.StringVar(&namespace, "namespace", defaultNS(), "kubernetes namespace")
}

func main() {
	flag.Parse()
	clientset, err := kube.GetClient("", kubeconfig)
	if err != nil {
		log.Fatalf("error creating kubernetes client (%s)", err)
		return
	}

	store := kube.New(clientset, namespace)

	lis, err := net.Listen("tcp", port)
	if err != nil {
		log.Fatalf("failed to listen: %v", err)
	}
	log.Printf("GRPC listening on %s", port)

	s := grpc.NewServer()
	pb.RegisterBrigadeServer(s, &server{client: clientset, store: store})
	// Register reflection service on gRPC server.
	// reflection.Register(s)
	if err := s.Serve(lis); err != nil {
		log.Fatalf("failed to serve: %v", err)
	}
}

func defaultNS() string {
	if ns := os.Getenv("BRIGADE_NAMESPACE"); ns != "" {
		return ns
	}
	return v1.NamespaceDefault
}
