/**
 * K8s File Detector — Pure function to identify Kubernetes manifest files.
 *
 * Detects K8s files by path patterns:
 * - k8s/, deploy/, helm/ directories
 * - *.yaml / *.yml files in deployment-related directories
 * - Common K8s manifest filenames (deployment.yaml, service.yaml, etc.)
 *
 * [CLEAN-CODE] Pure function — no side effects, no I/O.
 * [SRP] Single responsibility: detect whether a file is a K8s manifest.
 *
 * @module analyzers/platform-audit
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Directory prefixes that indicate Kubernetes manifests.
 * Files under these directories are always considered K8s files.
 */
const K8S_DIRECTORY_PREFIXES: readonly string[] = [
  "k8s/",
  "deploy/",
  "helm/",
  "kubernetes/",
  "manifests/",
  "charts/",
  ".kube/",
  "kustomize/",
  "base/",
  "overlays/",
];

/**
 * Filename patterns (case-insensitive) that indicate K8s manifests
 * regardless of directory location.
 */
const K8S_FILENAME_PATTERNS: readonly RegExp[] = [
  /deployment\.ya?ml$/i,
  /service\.ya?ml$/i,
  /ingress\.ya?ml$/i,
  /configmap\.ya?ml$/i,
  /secret\.ya?ml$/i,
  /statefulset\.ya?ml$/i,
  /daemonset\.ya?ml$/i,
  /cronjob\.ya?ml$/i,
  /job\.ya?ml$/i,
  /namespace\.ya?ml$/i,
  /rbac\.ya?ml$/i,
  /role\.ya?ml$/i,
  /rolebinding\.ya?ml$/i,
  /clusterrole\.ya?ml$/i,
  /clusterrolebinding\.ya?ml$/i,
  /networkpolicy\.ya?ml$/i,
  /pdb\.ya?ml$/i,
  /hpa\.ya?ml$/i,
  /pv\.ya?ml$/i,
  /pvc\.ya?ml$/i,
  /serviceaccount\.ya?ml$/i,
  /podsecuritypolicy\.ya?ml$/i,
  /limitrange\.ya?ml$/i,
  /resourcequota\.ya?ml$/i,
  /kustomization\.ya?ml$/i,
  /Chart\.ya?ml$/i,
  /values\.ya?ml$/i,
  /helmfile\.ya?ml$/i,
  /Dockerfile$/i,
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check if a file path is a Kubernetes manifest.
 *
 * A file is considered a K8s manifest if:
 * 1. It resides under a K8s-related directory (k8s/, deploy/, helm/, etc.)
 *    AND has a .yaml/.yml extension, OR
 * 2. Its filename matches a known K8s manifest pattern (deployment.yaml, etc.)
 *
 * @param filePath - Relative file path (e.g., "k8s/deployment.yaml")
 * @returns true if the file is a K8s manifest
 */
export function isK8sFile(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/");

  // Check if filename matches a K8s manifest pattern
  if (K8S_FILENAME_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return true;
  }

  // Check if file is under a K8s directory AND is YAML
  if (isYamlFile(normalized) && isInK8sDirectory(normalized)) {
    return true;
  }

  return false;
}

/**
 * Filter a list of file paths to only include K8s manifests.
 *
 * @param filePaths - Array of relative file paths
 * @returns Array of file paths that are K8s manifests
 */
export function filterK8sFiles(filePaths: readonly string[]): string[] {
  return filePaths.filter(isK8sFile);
}

/**
 * Check if any files in a list are K8s manifests.
 *
 * @param filePaths - Array of relative file paths
 * @returns true if at least one file is a K8s manifest
 */
export function hasK8sFiles(filePaths: readonly string[]): boolean {
  return filePaths.some(isK8sFile);
}

// ---------------------------------------------------------------------------
// Private Helpers
// ---------------------------------------------------------------------------

function isYamlFile(path: string): boolean {
  return /\.ya?ml$/i.test(path);
}

function isInK8sDirectory(path: string): boolean {
  return K8S_DIRECTORY_PREFIXES.some(
    (prefix) =>
      path.startsWith(prefix) || path.includes(`/${prefix}`),
  );
}
