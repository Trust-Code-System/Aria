export type ToolRisk =
  | "read_only"
  | "reversible_write"
  | "consequential_write"
  | "destructive"
  | "prohibited";

export interface ToolPolicy {
  risk: ToolRisk;
  requiresApproval: boolean;
  reason: string;
}

const PROHIBITED = [
  /(?:DISABLE|BYPASS).*(?:SECURITY|AUTH|MFA|2FA)/,
  /(?:EXPORT|READ|GET).*(?:TOKEN|PASSWORD|SECRET|CREDENTIAL)/,
];
const DESTRUCTIVE = [
  /(?:DELETE|TRASH|REMOVE|REVOKE|PURGE|ARCHIVE)/,
  /GITHUB_CLOSE_PULL_REQUEST/,
];
const CONSEQUENTIAL = [
  /(?:SEND|POST|PUBLISH|INVITE|FORWARD|REPLY|MERGE)/,
  /(?:CREATE|UPDATE|PATCH|MOVE|RENAME).*(?:EVENT|ISSUE|PAGE|FILE|MESSAGE|COMMENT|TASK|RECORD)/,
  /GOOGLECALENDAR_(?:CREATE|UPDATE)/,
  /NOTION_(?:CREATE|UPDATE)/,
  /GITHUB_(?:CREATE|UPDATE)/,
];
const REVERSIBLE = [/(?:CREATE|UPDATE).*(?:DRAFT|LABEL)/, /(?:STAR|UNSTAR|MARK)_/];
const READ_ONLY = [
  /(?:^|_)(?:GET|LIST|FETCH|SEARCH|FIND|READ|INSPECT|LOOKUP|QUERY)(?:_|$)/,
  /GMAIL_.*(?:THREADS|EMAILS|PROFILE)/,
];

/** Provider-agnostic, normalized tool risk policy. Unknown tools fail closed. */
export function classifyToolPolicy(toolName: string): ToolPolicy {
  const normalized = toolName.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  if (PROHIBITED.some((re) => re.test(normalized))) {
    return { risk: "prohibited", requiresApproval: true, reason: "This capability is prohibited." };
  }
  if (DESTRUCTIVE.some((re) => re.test(normalized))) {
    return { risk: "destructive", requiresApproval: true, reason: "This action can remove or finalize external data." };
  }
  if (REVERSIBLE.some((re) => re.test(normalized))) {
    return { risk: "reversible_write", requiresApproval: false, reason: "This action creates reversible provider state such as a draft." };
  }
  if (CONSEQUENTIAL.some((re) => re.test(normalized))) {
    return { risk: "consequential_write", requiresApproval: true, reason: "This action communicates or changes external state." };
  }
  if (READ_ONLY.some((re) => re.test(normalized))) {
    return { risk: "read_only", requiresApproval: false, reason: "This action only reads provider data." };
  }
  return {
    risk: "consequential_write",
    requiresApproval: true,
    reason: "Unknown provider tools require approval until explicitly classified.",
  };
}
