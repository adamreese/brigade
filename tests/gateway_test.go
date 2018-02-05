// +build integration

package tests

import (
	"bytes"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/Azure/brigade/pkg/webhook"
)

const (
	sharedSecret = "MySecret"
	endpoint     = "http://localhost:7744/events/github"
)

type hook struct {
	Ref    string `json:"ref"`
	Action string `json:"action"`

	Head struct {
		ID string `json:"id"`
	} `json:"head_commit"`

	Repo struct {
		FullName string `json:"full_name"`
	} `json:"repository"`

	PullRequest struct {
		Head struct {
			SHA string `json:"sha"`
		} `json:"head"`
	} `json:"pull_request"`
}

func newPushEvent() hook {
	var wh hook
	wh.Ref = "refs/heads/master"
	wh.Head.ID = "589e15029e1e44dee48de4800daf1f78e64287c0"
	wh.Repo.FullName = "deis/empty-testbed"
	return wh
}

func newPullEvent() hook {
	var wh hook
	wh.Action = "opened"
	wh.PullRequest.Head.SHA = "589e15029e1e44dee48de4800daf1f78e64287c0"
	wh.Repo.FullName = "deis/empty-testbed"
	return wh
}

func newRequest(event string, payload []byte) *http.Request {
	hmac := webhook.SHA1HMAC([]byte(sharedSecret), payload)

	req, _ := http.NewRequest(http.MethodPost, endpoint, bytes.NewReader(payload))
	req.Header.Set("X-Github-Event", event)
	req.Header.Set("X-Hub-Signature", string(hmac))
	return req
}

func TestGateway_push(t *testing.T) {
	hook := newPushEvent()

	payload, err := json.MarshalIndent(hook, "", "  ")
	if err != nil {
		t.Fatalf("failed to marshal webhook: %v", err)
	}

	request := newRequest("push", payload)
	resp, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Error(err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Errorf("%s %s: expected status code '200', got '%d'\n", request.Method, request.URL.String(), resp.StatusCode)
	}
}

func TestGateway_pull(t *testing.T) {
	hook := newPullEvent()

	payload, err := json.MarshalIndent(hook, "", "  ")
	if err != nil {
		t.Fatalf("failed to marshal webhook: %v", err)
	}

	request := newRequest("pull_request", payload)
	resp, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Error(err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Errorf("%s %s: expected status code '200', got '%d'\n", request.Method, request.URL.String(), resp.StatusCode)
	}
}
