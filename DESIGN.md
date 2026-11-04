# mimimd

## A quiet place to read

mimimd gives local Markdown a comfortable, colorful place to live. The document is the focus; navigation helps readers find their place, then recedes. Aim for the ease of a well-set page, not the density of a dashboard.

Keep the interface simple and recognizably Everforest. Use warm light grounds, forest-toned dark surfaces, generous whitespace, and small, purposeful moments of color. Avoid stacked cards, heavy outlines, gradients, and decorative chrome.

## Color with a purpose

Retain these base colors in both themes:

| Role       | Light     | Dark      |
| ---------- | --------- | --------- |
| Background | `#fdf6e3` | `#2d353b` |
| Surface    | `#f4f0d9` | `#343f44` |
| Foreground | `#5c6a72` | `#d3c6aa` |
| Red        | `#f85552` | `#e67e80` |
| Green      | `#8da101` | `#a7c080` |
| Blue       | `#3a94c5` | `#7fbbb3` |
| Purple     | `#df69ba` | `#d699b6` |
| Yellow     | `#dfa000` | `#dbbc7f` |

Use darker semantic accents for small light-theme text rather than applying the bright base colors indiscriminately:

| Text role                 | Light     | Dark      |
| ------------------------- | --------- | --------- |
| Green heading / selection | `#486b50` | `#a7c080` |
| Teal subheading / label   | `#356c68` | `#7fbbb3` |
| Blue link                 | `#216b94` | `#8ac7ce` |
| Plum code / YAML          | `#8b4779` | `#d699b6` |
| Gold quotation / accent   | `#8b681e` | `#dbbc7f` |

Red belongs to the large document H1, not small body text. Green establishes major sections, teal carries the deeper hierarchy, and blue identifies links. Plum distinguishes code; gold gives quotations a gentle pause.

Borders should feel like seams, not frames: mix foreground at 20% with background. For a selected surface, mix base green at 15% with background. Keep these relationships consistent across themes instead of substituting harsh black or white rules.

## One typographic voice

Use locally bundled **Inter Variable** throughout the interface, reading text, headings, text branding, tables, and Mermaid diagrams. Include normal and italic styles. The character should be clear and contemporary, without a separate serif reading voice or Geist substitution.

Use locally bundled **Hack**, with normal and italic styles, for code, file paths, and YAML. Mathematical notation uses KaTeX's own fonts. All font assets are local; make no remote font requests.

Set reading text in Inter at `1.125rem / 1.8`. Let paragraphs breathe, and use weight rather than excessive size changes to distinguish supporting text from controls.

| Level      | Treatment                                                                |
| ---------- | ------------------------------------------------------------------------ |
| H1         | `clamp(2.5rem, 4vw, 3.5rem)`, weight 600, line-height 1.3, palette red   |
| H2         | About `1.5rem`, weight 600, semantic green                               |
| H3         | About `1.1875rem`, weight 600, semantic teal                             |
| H4–H6      | Progressively quieter, semantic teal; retain distinct weight and spacing |
| Navigation | Typically `0.8125–0.875rem`, with comfortable line spacing               |

Keep headings compact but not tight. Leave more space before a section than after its title, so the title belongs visibly to the text that follows. Build spacing around 4px and 8px steps: 16–24px within related content, 32–48px between larger sections.

## A workspace around the page

In desktop folder mode, use `15.5rem minmax(0, 100ch) 13rem`: Documents on the left, the reading column in the middle, and On this page on the right. Center the workspace when extra width is available.

The main column has a responsive maximum of **100ch, including its inner padding**. This is a column measurement, not a promise of 100 body characters on every line. Give the text comfortable side gutters rather than stretching it to the column edges.

File mode removes the left rail entirely; do not leave an empty sidebar-shaped gap. Keep the main column limit and the outline's supporting role.

The desktop header and rails are sticky. Let long navigation remain reachable within the available height, and leave enough space below the header that heading destinations are not concealed.

The header contains the text-only **mimimd** wordmark in Inter, the tagline **a quiet place to read**, and the theme toggle. Do not place a logo icon beside the wordmark or add unrelated actions. Keep the current file path just above the document area in Hack.

At **1000px and below**, move to a single column. Files and Headings toggles reveal their panels in normal flow, never as overlays. Preserve the reading width, useful gutters, and a clear way back to the page; adapt the layout rather than shrinking everything.

## Navigation that stays quiet

The Documents rail combines a visibly labeled filename/path filter with a nested, collapsible file tree. Use indentation and subtle branch rules to explain folder relationships. A no-results message should help readers adjust the filter without disturbing the open document.

The active file has a soft green background, stronger text weight, and a trailing dot. These cues work together; selection must not depend on color alone. Keep file paths legible and allow long names to wrap without widening the page.

The outline mirrors heading depth through consistent indentation. Highlight the selected URL fragment with green text and a restrained rule. This is a navigation selection, not automatic scroll tracking: reading farther down the page should not move the highlight on its own.

Links in document content are blue and underlined. Keep that affordance visible at rest, with a stronger underline or darker accent on hover rather than fading the text.

## Markdown, carefully set

Inline code uses plum Hack on a faintly tinted surface, with modest padding and small corners. It should remain part of the sentence, not look like a button.

Code blocks use a quiet tinted ground, a subtle border, and a small language label when available. Preserve existing line breaks and indentation with `white-space: pre-wrap`; use `overflow-wrap: anywhere` for long lines. Code wraps within the reading column rather than deliberately forcing horizontal scrolling.

Tables use Inter, clear header weight, tinted header cells, and light horizontal rules. Give cells breathing room without turning each row into a card. Wide tables and math may scroll locally; neither should make the whole page scroll sideways.

Quotations use a slender gold rule, inset spacing, and a considered italic voice. Keep their background open rather than enclosing them in a callout card. Mermaid typography follows Inter and the surrounding theme; math retains KaTeX's own typographic character.

## Document properties

Frontmatter sits between the file path and document body in a compact **Document properties** disclosure, expanded initially. Treat it as supporting context, not a second document title or a collection of dashboard cards.

Use a subtle tinted panel with a green summary, gold disclosure marker, and small YAML label. Within the definition list, labels are teal; ordinary scalar values remain plain text. Primitive lists become quiet green chips, while nested values appear as plum Hack YAML. Chips are informational, not filters.

At **600px and below**, stack each label above its value. Long values should wrap naturally, with enough separation to keep neighboring properties distinct.

Show no panel for absent or empty frontmatter. For invalid or nonmapping YAML, show the source; invalid YAML also receives a short explanatory message while the document body remains readable. Display metadata as escaped text, never HTML, and show aliases without expanding them. Metadata does not enter the heading outline. Do not introduce metadata editing.

## Comfortable interaction

Use native disclosures, buttons, and links with meaningful labels and visible keyboard focus. Compact controls are at least `2.75rem` tall. Keep icons consistent in stroke and scale, reserving them for useful navigation cues rather than decorating every heading.

Favor a clear focus ring, a soft hover tint, and explicit selected states over animation. When transitions help communicate a change, keep them restrained—around 200ms with an ease-out—and respect reduced-motion preferences. Maintain readable foregrounds in both themes and preserve meaning without relying on hue alone.

The product remains a local reader: no editing, AI, accounts, cloud synchronization, or tabs. New visual decisions should make reading, finding a file, or following a document easier—not add another layer of interface.
