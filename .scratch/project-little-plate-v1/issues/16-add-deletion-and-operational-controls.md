# 16 - Add deletion and operational controls

**What to build:** Give caregivers control over their account data and give operators safe ways to retire content, restore service, and promote database changes before external beta.

**Blocked by:** 02 - Create an authenticated baby profile; 03 - Browse one reviewed preparation; 10 - Complete the Kitchen lifecycle.

**Status:** ready-for-agent

- [ ] An authenticated caregiver can request deletion of their account and household-owned child, plan, inventory, and history data.
- [ ] The deletion flow explains scope and any legally or operationally required retention before confirmation.
- [ ] Deletion is idempotent and cannot target another household.
- [ ] Partial deletion failure is recoverable and cannot leave the account appearing deleted while sensitive records remain normally accessible.
- [ ] An authorized operator can immediately prevent a problematic content revision from new use.
- [ ] Emergency retirement preserves historical rule and source provenance for prior deadlines and events.
- [ ] Normal users cannot invoke content retirement or other privileged operational actions.
- [ ] Local, staging, and production migration promotion behavior is documented and does not depend on untracked dashboard edits.
- [ ] Backup and restoration procedures are documented and rehearsed against non-production data.
- [ ] Incident handling identifies how to disable an affected recommendation/content path without bypassing unrelated safety checks.
- [ ] Integration tests prove deletion authorization, retry, isolation, and content-retirement behavior.
- [ ] Browser coverage proves caregiver deletion confirmation and completion behavior.
- [ ] Update this issue with verification evidence, rehearsal results, and known retention limitations.
