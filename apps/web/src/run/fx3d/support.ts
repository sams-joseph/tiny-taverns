/** Whether this browser can draw the board's effects in WebGL at all; asked once. */
let webgl: boolean | undefined;
export const canDrawWebGL = (): boolean => {
  if (webgl !== undefined) return webgl;
  if (typeof window === "undefined" || typeof window.WebGL2RenderingContext === "undefined") {
    return (webgl = false);
  }
  try {
    const probe = document.createElement("canvas").getContext("webgl2");
    webgl = probe !== null;
    probe?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    webgl = false;
  }
  return webgl;
};
