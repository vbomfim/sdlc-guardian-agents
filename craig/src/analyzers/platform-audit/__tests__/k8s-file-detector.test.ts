/**
 * K8s File Detector — Unit Tests
 *
 * Tests for the pure function that identifies Kubernetes manifest files.
 *
 * [TDD] Written BEFORE implementation — Red phase.
 *
 * @module analyzers/platform-audit/__tests__
 */

import { describe, it, expect } from "vitest";
import {
  isK8sFile,
  filterK8sFiles,
  hasK8sFiles,
} from "../k8s-file-detector.js";

describe("K8s File Detector", () => {
  // -----------------------------------------------------------------------
  // isK8sFile — directory-based detection
  // -----------------------------------------------------------------------

  describe("isK8sFile — K8s directory detection", () => {
    it.each([
      "k8s/deployment.yaml",
      "k8s/service.yml",
      "k8s/base/config.yaml",
      "deploy/app.yaml",
      "deploy/staging/values.yaml",
      "helm/templates/deployment.yaml",
      "kubernetes/namespace.yaml",
      "manifests/ingress.yaml",
      "charts/myapp/values.yaml",
      "kustomize/base/patch.yaml",
      "base/deployment.yaml",
      "overlays/prod/config.yaml",
    ])("returns true for %s (K8s directory + YAML)", (path) => {
      expect(isK8sFile(path)).toBe(true);
    });

    it.each([
      "src/k8s/deployment.yaml",
      "infra/deploy/app.yaml",
      "infra/helm/templates/service.yaml",
      "project/kubernetes/config.yaml",
    ])("returns true for nested K8s directory: %s", (path) => {
      expect(isK8sFile(path)).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // isK8sFile — filename pattern detection
  // -----------------------------------------------------------------------

  describe("isK8sFile — K8s filename patterns", () => {
    it.each([
      "deployment.yaml",
      "deployment.yml",
      "service.yaml",
      "ingress.yaml",
      "configmap.yaml",
      "secret.yaml",
      "statefulset.yaml",
      "daemonset.yaml",
      "cronjob.yaml",
      "job.yaml",
      "namespace.yaml",
      "rbac.yaml",
      "role.yaml",
      "rolebinding.yaml",
      "clusterrole.yaml",
      "clusterrolebinding.yaml",
      "networkpolicy.yaml",
      "hpa.yaml",
      "pdb.yaml",
      "pv.yaml",
      "pvc.yaml",
      "serviceaccount.yaml",
      "kustomization.yaml",
      "Chart.yaml",
      "values.yaml",
      "helmfile.yaml",
      "Dockerfile",
    ])("returns true for known K8s filename: %s", (path) => {
      expect(isK8sFile(path)).toBe(true);
    });

    it.each([
      "src/infrastructure/deployment.yaml",
      "any/path/to/service.yaml",
      "deep/nested/configmap.yml",
    ])("returns true for K8s filenames regardless of directory: %s", (path) => {
      expect(isK8sFile(path)).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // isK8sFile — negative cases
  // -----------------------------------------------------------------------

  describe("isK8sFile — non-K8s files", () => {
    it.each([
      "src/app.ts",
      "package.json",
      "README.md",
      ".github/workflows/ci.yaml",
      "src/config/database.yaml",
      "docs/architecture.yaml",
      "test/fixtures/sample.yaml",
      "src/models/user.ts",
      ".eslintrc.yaml",
      "docker-compose.yaml",
      "src/utils.js",
    ])("returns false for non-K8s file: %s", (path) => {
      expect(isK8sFile(path)).toBe(false);
    });

    it("returns false for non-YAML files in K8s directories", () => {
      expect(isK8sFile("k8s/README.md")).toBe(false);
      expect(isK8sFile("deploy/script.sh")).toBe(false);
      expect(isK8sFile("helm/.gitignore")).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // isK8sFile — edge cases
  // -----------------------------------------------------------------------

  describe("isK8sFile — edge cases", () => {
    it("handles backslashes (Windows paths)", () => {
      expect(isK8sFile("k8s\\deployment.yaml")).toBe(true);
    });

    it("handles empty string", () => {
      expect(isK8sFile("")).toBe(false);
    });

    it("is case-insensitive for K8s filenames", () => {
      expect(isK8sFile("Deployment.YAML")).toBe(true);
      expect(isK8sFile("SERVICE.YML")).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // filterK8sFiles
  // -----------------------------------------------------------------------

  describe("filterK8sFiles", () => {
    it("filters only K8s files from mixed list", () => {
      const files = [
        "src/app.ts",
        "k8s/deployment.yaml",
        "package.json",
        "deploy/service.yaml",
        "README.md",
      ];

      const result = filterK8sFiles(files);

      expect(result).toEqual([
        "k8s/deployment.yaml",
        "deploy/service.yaml",
      ]);
    });

    it("returns empty array when no K8s files present", () => {
      const files = ["src/app.ts", "package.json"];
      expect(filterK8sFiles(files)).toEqual([]);
    });

    it("returns all files when all are K8s files", () => {
      const files = ["k8s/deployment.yaml", "deploy/service.yaml"];
      expect(filterK8sFiles(files)).toEqual(files);
    });

    it("handles empty input", () => {
      expect(filterK8sFiles([])).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // hasK8sFiles
  // -----------------------------------------------------------------------

  describe("hasK8sFiles", () => {
    it("returns true when K8s files are present", () => {
      expect(hasK8sFiles(["src/app.ts", "k8s/deployment.yaml"])).toBe(true);
    });

    it("returns false when no K8s files are present", () => {
      expect(hasK8sFiles(["src/app.ts", "package.json"])).toBe(false);
    });

    it("returns false for empty array", () => {
      expect(hasK8sFiles([])).toBe(false);
    });
  });
});
