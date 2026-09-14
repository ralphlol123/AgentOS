// Deprecated agent/skill alias tables and resolution helpers (slice 4).
//
// Slices 2-3 retired a set of agent and skill IDs. Existing workspaces still
// reference the retired IDs in project.yaml (agents.enabled/capabilities),
// .agentos/agents/*.md, and .agentos/skills.md. Every command that accepts an
// agent/skill ID resolves retired IDs to their canonical replacement and,
// where a human is directly driving the command, emits an explicit deprecation
// notice naming the canonical ID - never silently dropping or re-labelling.
function normalizeToken(value) {
    return String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'project';
}
// Friendly shorthands (resolved silently) plus retired six-role-consolidation
// IDs (resolved with a deprecation notice). Keys are the raw token already
// normalized to lowercase kebab-case.
export const AGENT_ALIASES = {
    // Friendly shorthands (existing behavior, no notice).
    review: 'reviewer',
    release: 'release-manager',
    planning: 'planner',
    pm: 'planner',
    impl: 'developer',
    frontend: 'developer',
    backend: 'developer',
    security: 'security-reviewer',
    // Retired agent IDs (slices 2-3 six-role consolidation) - deprecation notice.
    'project-manager': 'planner',
    implementation: 'developer',
    qa: 'tester',
    'code-reviewer': 'reviewer',
    'frontend-engineer': 'developer',
    'backend-engineer': 'developer',
    'data-engineer': 'developer',
};
// Retired agent IDs are those that once had their own generated card/template
// and were absorbed into a canonical six-role agent. These trigger a
// deprecation notice (unlike the friendly shorthands above).
export const RETIRED_AGENT_IDS = new Set([
    'project-manager',
    'implementation',
    'qa',
    'code-reviewer',
    'frontend-engineer',
    'backend-engineer',
    'data-engineer',
]);
// Retired skill IDs (slices 2-3 framework-agnostic consolidation). Every entry
// maps to a canonical skill; multiple retired IDs may map to one canonical id
// (e.g. ai-slop-design-review + interface-feel-polish -> frontend-design).
export const SKILL_ALIASES = {
    'systematic-debugging': 'debugging',
    'shared-repo-git-safety': 'git-safety',
    'agent-output-verification': 'verification',
    'grounded-codebase-docs': 'documentation',
    'ai-slop-design-review': 'frontend-design',
    'interface-feel-polish': 'frontend-design',
    'frontend-build-verification': 'frontend-testing',
    'nuxt-e2e-testing': 'frontend-testing',
    'nestjs-feature-implementation': 'backend-development',
    'backend-service-verification': 'backend-testing',
    'nestjs-auth-guards': 'authorization',
    'full-system-rehearsal': 'integration-testing',
    'requesting-code-review': 'code-review',
    'backend-pr-review': 'code-review',
    'github-code-review': 'code-review',
    'github-pr-workflow': 'pull-request-workflow',
    'conventional-commit': 'commit-messages',
    'github-actions-verification': 'ci-verification',
    'secret-scanner-safe-edits': 'git-safety',
};
export const RETIRED_SKILL_IDS = new Set(Object.keys(SKILL_ALIASES));
export function canonicalAgentId(value) {
    const id = normalizeToken(value);
    return AGENT_ALIASES[id] ?? id;
}
export function canonicalSkillId(value) {
    const id = normalizeToken(value);
    return SKILL_ALIASES[id] ?? id;
}
export function resolveAgentAlias(value) {
    const raw = String(value ?? '').trim();
    const token = normalizeToken(raw);
    const id = AGENT_ALIASES[token] ?? token;
    return RETIRED_AGENT_IDS.has(token) ? { id, deprecated: true, from: raw } : { id, deprecated: false };
}
export function resolveSkillAlias(value) {
    const raw = String(value ?? '').trim();
    const token = normalizeToken(raw);
    const id = SKILL_ALIASES[token] ?? token;
    return RETIRED_SKILL_IDS.has(token) ? { id, deprecated: true, from: raw } : { id, deprecated: false };
}
export function agentDeprecationNotice(token, canonical) {
    return `Deprecated agent alias '${token}' -> '${canonical}' (retired id).`;
}
export function skillDeprecationNotice(token, canonical) {
    return `Deprecated skill '${token}' -> '${canonical}' (retired id); installing the canonical skill.`;
}
//# sourceMappingURL=aliases.js.map