# Fonts for the screenshot tests

The app's sans and mono text uses the phone's own fonts, which differ from one
machine to the next. `e2e/visual.spec.js` swaps in these instead, so a
screenshot taken on a laptop matches one taken in CI.

Latin subsets (made with `pyftsubset`) of:

- Inter Regular, Medium and SemiBold, under the SIL Open Font License 1.1 (`Inter-OFL.txt`)
- DejaVu Sans Mono, under the Bitstream Vera licence (`DejaVu-LICENSE.txt`)

They are used by the tests only and never ship in the app.
