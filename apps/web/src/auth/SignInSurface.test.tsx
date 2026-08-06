import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SignInSurface } from "./SignInSurface";

/**
 * With no provider configured the surface renders *nothing* — it does not
 * render Clerk's components and let them fail.
 *
 * That distinction is the whole test. Every component `SignInSurface` reaches
 * for (`Show`, `SignInButton`, `UserButton`) throws without `ClerkProvider`
 * above it, so "returns null before touching any of them" is what makes the
 * gallery mountable for a developer with no publishable key. If someone drops
 * the `configured` guard, this test fails with that throw rather than passing
 * quietly.
 */
describe("SignInSurface", () => {
  it("renders nothing when no hosted identity provider is configured", () => {
    const { container } = render(<SignInSurface />);

    expect(container).toBeEmptyDOMElement();
  });
});
