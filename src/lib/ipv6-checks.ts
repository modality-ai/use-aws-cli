/** One verification outcome, one row of the report. */
export type CheckResult = {
  id: string;
  name: string;
  ok: boolean;
  detail: string;
  fix?: string;
};

/** Collect every assigned IPv6 address across all network interfaces. */
export function collectIpv6Addresses(enis: any[]): string[] {
  return enis
    .flatMap((eni: any) => (eni.Ipv6Addresses ?? []) as any[])
    .map((address: any): string => String(address.Ipv6Address ?? ""))
    .filter((address: string) => address !== "");
}

/** Find the ::/0 route that goes to an internet gateway or an egress-only gateway. */
export function findIpv6DefaultRoute(routes: any[]): any | undefined {
  return routes.find(
    (route: any) =>
      route.DestinationIpv6CidrBlock === "::/0" &&
      (String(route.GatewayId ?? "").startsWith("igw-") || Boolean(route.EgressOnlyInternetGatewayId)),
  );
}

/** Assemble the report envelope: pass/fail counts and a one-line summary. */
export function buildResult(instanceId: string, checks: CheckResult[], ipv6Addresses: string[] = []) {
  const passed = checks.filter((check) => check.ok).length;
  const failed = checks.length - passed;
  const failedIds = checks.filter((check) => !check.ok).map((check) => check.id);
  const addressText = ipv6Addresses.length > 0 ? ` — IPv6: ${ipv6Addresses.join(", ")}` : "";
  const message =
    failed === 0
      ? `ipv6 verify ${instanceId}: all ${checks.length} checks passed${addressText}`
      : `ipv6 verify ${instanceId}: ${passed}/${checks.length} checks passed — failed: ${failedIds.join(", ")}${addressText}`;
  return {
    success: failed === 0,
    instanceId,
    ipv6Addresses,
    checks,
    summary: { passed, failed },
    message,
  };
}
