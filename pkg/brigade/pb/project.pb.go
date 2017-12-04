// Code generated by protoc-gen-go.
// source: project.proto
// DO NOT EDIT!

package pb

import proto "github.com/golang/protobuf/proto"
import fmt "fmt"
import math "math"

// Reference imports to suppress errors if they are not otherwise used.
var _ = proto.Marshal
var _ = fmt.Errorf
var _ = math.Inf

// Project describes an brigade project
//
// This is an internal representation of a project, and contains data that
// should not be made available to the JavaScript runtime.
type Project struct {
	// ID is the computed name of the project (brigade-aeff2343a3234ff)
	Id string `protobuf:"bytes,1,opt,name=id" json:"id,omitempty"`
	// Name is the human readable name of project.
	Name string `protobuf:"bytes,2,opt,name=name" json:"name,omitempty"`
	// Repo describes the repository where the source code is stored.
	Repo *Repo `protobuf:"bytes,3,opt,name=repo" json:"repo,omitempty"`
	// Kubernetes holds information about Kubernetes
	Kubernetes *Kubernetes `protobuf:"bytes,4,opt,name=kubernetes" json:"kubernetes,omitempty"`
	// SharedSecret is the GitHub shared key
	SharedSecret string `protobuf:"bytes,5,opt,name=shared_secret,json=sharedSecret" json:"shared_secret,omitempty"`
	// Github holds information about Github.
	Github *Github `protobuf:"bytes,6,opt,name=github" json:"github,omitempty"`
	// Secrets is environment variables for brigade.js
	Secrets map[string]string `protobuf:"bytes,7,rep,name=secrets" json:"secrets,omitempty" protobuf_key:"bytes,1,opt,name=key" protobuf_val:"bytes,2,opt,name=value"`
}

func (m *Project) Reset()                    { *m = Project{} }
func (m *Project) String() string            { return proto.CompactTextString(m) }
func (*Project) ProtoMessage()               {}
func (*Project) Descriptor() ([]byte, []int) { return fileDescriptor2, []int{0} }

func (m *Project) GetRepo() *Repo {
	if m != nil {
		return m.Repo
	}
	return nil
}

func (m *Project) GetKubernetes() *Kubernetes {
	if m != nil {
		return m.Kubernetes
	}
	return nil
}

func (m *Project) GetGithub() *Github {
	if m != nil {
		return m.Github
	}
	return nil
}

func (m *Project) GetSecrets() map[string]string {
	if m != nil {
		return m.Secrets
	}
	return nil
}

// Repo describes a Git repository.
type Repo struct {
	// Name of the repository. For GitHub, this is of the form `org/name` or `user/name`
	Name string `protobuf:"bytes,1,opt,name=name" json:"name,omitempty"`
	// Owner of the repositoy. For Github this is `org` or `user`
	Owner string `protobuf:"bytes,2,opt,name=owner" json:"owner,omitempty"`
	// CloneURL is the URL at which the repository can be cloned
	// Traditionally, this is an HTTPS URL.
	CloneUrl string `protobuf:"bytes,3,opt,name=clone_url,json=cloneUrl" json:"clone_url,omitempty"`
	// SSHKey is the auth string for SSH-based cloning
	SshKey string `protobuf:"bytes,4,opt,name=ssh_key,json=sshKey" json:"ssh_key,omitempty"`
}

func (m *Repo) Reset()                    { *m = Repo{} }
func (m *Repo) String() string            { return proto.CompactTextString(m) }
func (*Repo) ProtoMessage()               {}
func (*Repo) Descriptor() ([]byte, []int) { return fileDescriptor2, []int{1} }

// Kubernetes describes the Kubernetes configuration for a project.
type Kubernetes struct {
	// Namespace is the namespace of this project.
	Namespace string `protobuf:"bytes,1,opt,name=namespace" json:"namespace,omitempty"`
	// VCSSidecar is the image name/tag for the sidecar that pulls VCS data
	VcsSidecar string `protobuf:"bytes,2,opt,name=vcs_sidecar,json=vcsSidecar" json:"vcs_sidecar,omitempty"`
}

func (m *Kubernetes) Reset()                    { *m = Kubernetes{} }
func (m *Kubernetes) String() string            { return proto.CompactTextString(m) }
func (*Kubernetes) ProtoMessage()               {}
func (*Kubernetes) Descriptor() ([]byte, []int) { return fileDescriptor2, []int{2} }

// Github describes the Github configuration for a project.
type Github struct {
	// Token is used for oauth2 for client interactions.
	Token string `protobuf:"bytes,1,opt,name=token" json:"token,omitempty"`
}

func (m *Github) Reset()                    { *m = Github{} }
func (m *Github) String() string            { return proto.CompactTextString(m) }
func (*Github) ProtoMessage()               {}
func (*Github) Descriptor() ([]byte, []int) { return fileDescriptor2, []int{3} }

func init() {
	proto.RegisterType((*Project)(nil), "pb.Project")
	proto.RegisterType((*Repo)(nil), "pb.Repo")
	proto.RegisterType((*Kubernetes)(nil), "pb.Kubernetes")
	proto.RegisterType((*Github)(nil), "pb.Github")
}

func init() { proto.RegisterFile("project.proto", fileDescriptor2) }

var fileDescriptor2 = []byte{
	// 348 bytes of a gzipped FileDescriptorProto
	0x1f, 0x8b, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x02, 0xff, 0x4c, 0x92, 0x4f, 0x6f, 0xaa, 0x40,
	0x14, 0xc5, 0x03, 0x22, 0xc8, 0xf5, 0x4f, 0x5e, 0x6e, 0x4c, 0xde, 0xe4, 0x3d, 0xd3, 0x1a, 0xba,
	0x71, 0xc5, 0xc2, 0x6e, 0x1a, 0xf7, 0x4d, 0x17, 0x6e, 0x1a, 0x4c, 0xd7, 0x84, 0x3f, 0xb7, 0x85,
	0x4a, 0x19, 0x32, 0x03, 0x36, 0x7e, 0xaf, 0x7e, 0xc0, 0x66, 0x66, 0x40, 0xdd, 0xcd, 0xfd, 0xdd,
	0xe3, 0x39, 0xde, 0x13, 0x60, 0xde, 0x08, 0xfe, 0x49, 0x59, 0x1b, 0x36, 0x82, 0xb7, 0x1c, 0xed,
	0x26, 0x0d, 0x7e, 0x6c, 0xf0, 0x5e, 0x0d, 0xc5, 0x05, 0xd8, 0x65, 0xce, 0xac, 0xb5, 0xb5, 0xf1,
	0x23, 0xbb, 0xcc, 0x11, 0xc1, 0xa9, 0x93, 0x2f, 0x62, 0xb6, 0x26, 0xfa, 0x8d, 0x2b, 0x70, 0x04,
	0x35, 0x9c, 0x8d, 0xd6, 0xd6, 0x66, 0xba, 0x9d, 0x84, 0x4d, 0x1a, 0x46, 0xd4, 0xf0, 0x48, 0x53,
	0x0c, 0x01, 0x8e, 0x5d, 0x4a, 0xa2, 0xa6, 0x96, 0x24, 0x73, 0xb4, 0x66, 0xa1, 0x34, 0xfb, 0x0b,
	0x8d, 0x6e, 0x14, 0xf8, 0x00, 0x73, 0x59, 0x24, 0x82, 0xf2, 0x58, 0x52, 0x26, 0xa8, 0x65, 0x63,
	0x1d, 0x35, 0x33, 0xf0, 0xa0, 0x19, 0x06, 0xe0, 0x7e, 0x94, 0x6d, 0xd1, 0xa5, 0xcc, 0xd5, 0x86,
	0xa0, 0x0c, 0x5f, 0x34, 0x89, 0xfa, 0x0d, 0x6e, 0xc1, 0x33, 0x0e, 0x92, 0x79, 0xeb, 0xd1, 0x66,
	0xba, 0x65, 0x4a, 0xd4, 0x1f, 0x16, 0x1a, 0x23, 0xf9, 0x5c, 0xb7, 0xe2, 0x1c, 0x0d, 0xc2, 0x7f,
	0x3b, 0x98, 0xdd, 0x2e, 0xf0, 0x0f, 0x8c, 0x8e, 0x74, 0xee, 0xef, 0x57, 0x4f, 0x5c, 0xc2, 0xf8,
	0x94, 0x54, 0xdd, 0xd0, 0x80, 0x19, 0x76, 0xf6, 0x93, 0x15, 0xbc, 0x83, 0xa3, 0xce, 0xbe, 0x54,
	0x64, 0xdd, 0x54, 0xb4, 0x84, 0x31, 0xff, 0xae, 0x49, 0x0c, 0xbf, 0xd2, 0x03, 0xfe, 0x07, 0x3f,
	0xab, 0x78, 0x4d, 0x71, 0x27, 0x2a, 0xdd, 0x9e, 0x1f, 0x4d, 0x34, 0x78, 0x13, 0x15, 0xfe, 0x05,
	0x4f, 0xca, 0x22, 0x56, 0xf1, 0x8e, 0x5e, 0xb9, 0x52, 0x16, 0x7b, 0x3a, 0x07, 0x7b, 0x80, 0x6b,
	0x75, 0xb8, 0x02, 0x5f, 0x25, 0xc8, 0x26, 0xc9, 0x86, 0xc8, 0x2b, 0xc0, 0x7b, 0x98, 0x9e, 0x32,
	0x19, 0xcb, 0x32, 0xa7, 0x2c, 0x19, 0xd2, 0xe1, 0x94, 0xc9, 0x83, 0x21, 0xc1, 0x1d, 0xb8, 0xa6,
	0x36, 0xf5, 0x17, 0x5b, 0x7e, 0xa4, 0xba, 0x37, 0x31, 0x43, 0xea, 0xea, 0xcf, 0xe2, 0xf1, 0x37,
	0x00, 0x00, 0xff, 0xff, 0x77, 0xc4, 0x1b, 0x76, 0x27, 0x02, 0x00, 0x00,
}
