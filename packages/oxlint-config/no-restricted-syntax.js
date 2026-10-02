/**
 * ESLint's core `no-restricted-syntax`, which oxlint does not implement natively, as an
 * oxlint JS plugin. Each option is an esquery selector and the message to report on a
 * match, the same shape ESLint takes, so the selectors in `design-system.json` are the
 * designers' (`packages/design-system/_adherence.oxlintrc.json`) unchanged.
 */
const noRestrictedSyntax = {
  meta: {
    type: "suggestion",
    schema: {
      type: "array",
      items: {
        oneOf: [
          { type: "string" },
          {
            type: "object",
            properties: { selector: { type: "string" }, message: { type: "string" } },
            required: ["selector"],
            additionalProperties: false,
          },
        ],
      },
      uniqueItems: true,
    },
  },
  create(context) {
    const visitors = {};
    for (const option of context.options) {
      const { selector, message } = typeof option === "string" ? { selector: option } : option;
      visitors[selector] = (node) =>
        context.report({ node, message: message ?? `Using '${selector}' is not allowed.` });
    }
    return visitors;
  },
};

export default {
  meta: { name: "taverns" },
  rules: { "no-restricted-syntax": noRestrictedSyntax },
};
