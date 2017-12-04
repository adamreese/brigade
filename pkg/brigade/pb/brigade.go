package pb

import "github.com/Azure/brigade/pkg/brigade"

//go:generate protoc --proto_path=$GOPATH/src:. --go_out=plugins=grpc:. build.proto job.proto project.proto

func BrigadeBuild(b *Build) brigade.Build {
	return brigade.Build{
		ProjectID: b.ProjectId,
		Type:      b.Type,
		Provider:  b.Provider,
		Commit:    b.Commit,
		Payload:   b.Payload,
		Script:    b.Script,
	}
}

func BuildProto(b *brigade.Build) *Build {
	return &Build{
		ProjectId: b.ProjectID,
		Type:      b.Type,
		Provider:  b.Provider,
		Commit:    b.Commit,
		Payload:   b.Payload,
		Script:    b.Script,
	}
}
