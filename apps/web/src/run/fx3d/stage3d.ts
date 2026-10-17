/**
 * The three.js stage and what plays on it, as one chunk the board loads only
 * when it has WebGL to draw on (`Fx3D.tsx` imports it dynamically), so a
 * screen that never draws an effect never downloads three.js.
 */
export { FxEngine } from "./engine";
export { playBlast, playHeal, playStrike } from "./choreography";
