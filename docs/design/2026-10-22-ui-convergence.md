# Shared interface controls

Layout names, drawing templates, chart settings and Agent fields consume the
same form-control stylesheet. Text fields keep their single resting border and
draw nothing on focus: no border colour change and no ring, so the caret is the
only focus cue and the browser outline stays suppressed. Sizing, radii and
transitions use the existing KCQ tokens. Input errors keep a persistent danger
border.

Textareas retain content growth and internal scrolling and follow the same rule:
no focus border and no ring. Switch focus uses the interface focus token, and
non-text controls — buttons, switches, navigation rows and drag handles — keep
the keyboard focus ring.
Buttons and switches respect reduced motion, and shared hover fills apply only
to fine pointers that support hover. Expanded triggers keep their active fill.

Focus feedback is per placement, not one global treatment. Where a field owns a
border but would otherwise have no cue, focusing brightens that same border to
`--klc-color-ui-border-strong`; nothing gains a ring or a new boxed outline. The
shared modal search bar (indicator selection, market-data sources, symbol
selection) brightens its top and bottom rules, the Agent connection underline
fields brighten their bottom rule, and the market-data endpoint box and the Agent
model search box brighten their border. Plain dialog fields stay unchanged on
focus.

All modal consumers share a dynamic viewport height limit, including landscape
phones and browser chrome changes. Their scrollable body yields space to the
header and footer. Long titles truncate within the available header column.

Verify these contracts in real browser computed styles and keyboard interactions
alongside BaseModal and public toolbar unit tests. No chart data, storage or
Agent execution behavior changes.

Composite search fields, Agent composers and message editors keep their bare text
field borderless: composers and message editors also draw nothing on the outer
group, so a focused field looks the same as an idle one, while modal search bars
share one component and brighten the rules they already own. The script panel
separator keeps a visible keyboard focus indicator. At narrow widths, trailing
layout and screenshot actions cannot consume the entire toolbar: they occupy at
most half the row and scroll independently, preserving a usable
instrument-control region.
