package main

import (
	"context"
	"flag"
	"io"
	"io/ioutil"
	"log"

	"google.golang.org/grpc"

	"github.com/deis/brigade/pkg/brigade/pb"
)

const address = "localhost:50051"

var build = pb.Build{
	Commit:    "9c75584920f1297008118915024927cc099d5dcc",
	Provider:  "github",
	Type:      "push",
	ProjectId: "brigade-830c16d4aaf6f5490937ad719afd8490a5bcbef064d397411043ac",
	Payload:   []byte("{}"),
}

func main() {

	if flag.NArg() > 0 {
		script, err := ioutil.ReadFile(flag.Arg(1))
		if err != nil {
			log.Fatal(err)
		}
		build.Script = script
	}

	// Set up a connection to the server.
	conn, err := grpc.Dial(address, grpc.WithInsecure())
	if err != nil {
		log.Fatalf("did not connect: %v", err)
	}
	defer conn.Close()
	c := pb.NewBrigadeClient(conn)

	ctx := context.Background()

	stream, err := c.CreateBuild(ctx, &build)
	if err != nil {
		log.Fatalf("could not greet: %v", err)
	}
	defer stream.CloseSend()

	waitc := make(chan struct{})
	go func() {
		for {
			in, err := stream.Recv()
			if err == io.EOF {
				// read done.
				close(waitc)
				return
			}
			if err != nil {
				log.Fatalf("Failed to receive a note : %v", err)
			}
			log.Print(in)
		}
	}()
	<-waitc

	log.Printf("Build: %#v", build)
}
