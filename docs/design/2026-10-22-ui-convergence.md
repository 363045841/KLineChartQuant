# Shared interface controls

Layout names, drawing templates, chart settings and Agent fields consume the
same form-control stylesheet. That stylesheet must supply a visible focus ring
after removing the browser outline. Sizing, radii and transitions use the existing
KCQ tokens. Input errors keep a persistent danger border.

Textareas retain content growth and internal scrolling; their ring appears for
both pointer and keyboard focus. Switch focus uses the interface focus token.
Buttons and switches respect reduced motion, and shared hover fills apply only
to fine pointers that support hover. Expanded triggers keep their active fill.

All modal consumers share a dynamic viewport height limit, including landscape
phones and browser chrome changes. Their scrollable body yields space to the
header and footer. Long titles truncate within the available header column.

Verify these contracts in real browser computed styles and keyboard interactions
alongside BaseModal and public toolbar unit tests. No chart data, storage or
Agent execution behavior changes.

Composite search fields, Agent composers and message editors own focus on their
outer group when their bare text field is active. The script panel separator
keeps a visible keyboard focus indicator. At narrow widths, trailing layout and
screenshot actions cannot consume the entire toolbar: they occupy at most half
the row and scroll independently, preserving a usable instrument-control region.
