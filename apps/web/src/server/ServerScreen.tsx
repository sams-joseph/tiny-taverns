import { ServerPanel } from "../api/ServerPanel";
import { TopBar } from "../shell/TopBar";

/**
 * Where a developer with no hosted sign-in pastes a machine token, and the only
 * interactive proof that the machine-token credential still authenticates from
 * a browser. Nav-less: `ApiFailureNotice` and the signed-out page link here.
 */
export function ServerScreen() {
  return (
    <>
      <TopBar
        title="Developer token"
        subtitle="Connect this browser to the API with a machine token."
      />
      <ServerPanel />
    </>
  );
}
