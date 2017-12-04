package validate

import (
	"strings"

	"github.com/deis/brigade/pkg/brigade"
)

func ProjectID(id string) bool {
	return strings.HasPrefix(id, "brigade-")
}

func RepoName(name string) bool {
	return strings.Count(name, "/") == 3
}

func Build(build *brigade.Build) bool {
	switch {
	case !ProjectID(build.ProjectID):
		return false
	case build.Type == "":
		return false
	case build.Provider == "":
		return false
	}
	return true
}
