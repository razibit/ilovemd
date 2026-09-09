import type { DocumentSnapshot } from "@folio/engine";
export const fixture = (source: string): DocumentSnapshot => ({
  id: "test",
  revision: 1,
  source,
  assets: {},
  settings: { singleDollarMath: true, macros: {} },
});
export const scientific = String.raw`# Scientific regression

Inline $E=mc^2$ and chemistry $\ce{H2O}$.

$$
\begin{aligned}a &= \frac{1}{2}\\ b&=\sqrt{x}\end{aligned}
$$

$$
\begin{pmatrix}1&2\\3&4\end{pmatrix}\quad\sum_{n=1}^\infty n^{-2}=\frac{\pi^2}{6}
$$

$$
f(x)=\begin{cases}x^2&x\ge0\\-x&x<0\end{cases}\tag{1}
$$

বাংলা লেখা — مرحبا بالعالم — Unicode α β γ.

| Label | Equation | Notes |
| :--- | ---: | :---: |
| Fraction | $\frac{a}{b}$ | **bold** and escaped \| pipe |

:::columns
### Left flow

Column content one.

### Next flow

Column content two.
:::

~~~typescript
const preserved = '<script>not executable</script>';
~~~

[A useful link](https://example.com)

Footnotes work.[^1]

[^1]: Reference content.
`;
export const longTable =
  "# Multi-page table\n\n| Row | Value | Notes |\n| --- | --- | --- |\n" +
  Array.from(
    { length: 180 },
    (_, i) =>
      `| ROW_${String(i).padStart(3, "0")} | ${i} | A long but wrapping cell with complete content. |`,
  ).join("\n") +
  "\n\nFINAL_CONTENT_MARKER\n";
