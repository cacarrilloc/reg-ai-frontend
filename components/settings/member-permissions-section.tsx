"use client";

import { useEffect, useState } from "react";
import { Shield } from "lucide-react";
import { fetchCurrentMembership } from "@/lib/member-capabilities";
import {
  canViewMemberPermissions,
  isReservedInternalOrgId,
} from "@/lib/system-permissions";
import { useBackendAuth } from "@/lib/use-backend-auth";
import { MemberPermissionsWorkspace } from "@/components/settings/member-permissions-workspace";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Organization Settings section for default System permissions per role.
 * Visible/editable: Master Users on external orgs; everyone on Dev/Staging/Production.
 */
export function MemberPermissionsSection() {
  const { authState, getAuthToken, orgId, orgName } = useBackendAuth();
  const [visible, setVisible] = useState(isReservedInternalOrgId(orgId));
  const [readOnly, setReadOnly] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (authState !== "ready" || !orgId) {
        setVisible(false);
        return;
      }
      try {
        const token = await getAuthToken();
        const me = await fetchCurrentMembership({ token, orgId, orgName });
        if (cancelled) {
          return;
        }
        setVisible(
          Boolean(me.can_manage_member_permissions) ||
            canViewMemberPermissions({ orgId, role: me.role })
        );
        setReadOnly(me.can_edit_member_permissions === false);
      } catch {
        if (!cancelled) {
          setVisible(canViewMemberPermissions({ orgId, role: null }));
          setReadOnly(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [authState, getAuthToken, orgId, orgName]);

  if (!visible) {
    return null;
  }

  return (
    <Card id="member-permissions">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Shield className="h-5 w-5" />
          ADMIN ONLY: Edit System Role Permissions ⚠️
        </CardTitle>
        <CardDescription>
          Set default System permissions for each organization role. Use checkboxes and Save to
          persist defaults for this organization. External organizations: Master Users only.
          Development, Staging, and Production: editable by all members.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <MemberPermissionsWorkspace embedded readOnly={readOnly} />
      </CardContent>
    </Card>
  );
}
