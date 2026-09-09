export const sample = String.raw`# A place for your best thinking.

From the first rough note to the final published page. Write in Markdown, see your ideas take shape, and export with confidence.

:::note
**Make yourself at home.** This is a real, editable document. Try changing a sentence on the left — your preview will follow along.
:::

## 01 · The essentials

Good writing starts with a little structure. Use **bold for emphasis**, *italics for nuance*, and [links for a little more context](https://commonmark.org).

- Keep your ideas close and your formatting simple.
- Bring a little order with lists and headings.
- Let the document do the talking.

> “The art of writing is the art of discovering what you believe.”

## 02 · Room for precision

Some ideas are best expressed as equations. Inline math like $E = mc^2$ sits naturally within your writing.

$$
\int_{-\infty}^{\infty} e^{-x^2}\,dx = \sqrt{\pi}
$$

| Capability | In your workspace | In your export |
| :--- | :--- | :--- |
| Mathematics | HTML + MathML | Typeset equations |
| Tables | Aligned and readable | Repeated headers |
| Images | Stored on this device | Included with your document |

## 03 · A little more possibility

:::columns
### Space to explore

Arrange related ideas in two flowing columns. On a smaller screen, they become a single readable stream.

### Built to travel

Export a PDF for sharing, HTML for publishing, or a Markdown bundle to keep your source and images together.
:::

~~~typescript
const idea = {
  title: "Something worth writing",
  possibilities: Infinity,
};
~~~

## 04 · The scientific notebook

Chemistry: $\ce{2H2 + O2 -> 2H2O}$.

$$
f(x)=\begin{cases}x^2 & x \geq 0\\-x & x < 0\end{cases}
$$

- [x] Start with an idea
- [x] Give it a little structure
- [ ] Make it your own

A small note can carry a useful reference.[^note]

[^note]: Your source and export data stay on this device. PDF, PNG and standalone HTML are generated in your browser.
`;
export const templates: Record<string, string> = {
  "Blank document": "# Untitled\n\n",
  "Research note": String.raw`# Research note

## Question

What would we like to understand?

## Method

## Observations

| Observation | Result |
| --- | --- |
| First trial | Pending |

## Conclusion

## References
`,
  "Technical guide":
    "# Technical guide\n\n## Overview\n\n## Getting started\n\n```bash\nnpm install\n```\n\n## Usage\n\n## Troubleshooting\n",
  "Welcome to iLoveMd": sample,
};
