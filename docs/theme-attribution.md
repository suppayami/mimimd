# Everforest Medium

Palette source: [sainnhe/everforest, autoload/everforest.vim](https://github.com/sainnhe/everforest/blob/master/autoload/everforest.vim), `everforest#get_palette`, medium background branch and shared foreground palette. Verified against upstream during implementation. Light background: #fdf6e3; dark background: #2d353b.

The application, custom Shiki definitions, and Mermaid configuration share `src/themes/everforest.ts`. This is not the generic built-in Shiki Everforest theme. Body text and interactive labels use the palette foreground rather than low-contrast light accent colors. Light syntax uses the upstream foreground with bold/italic distinctions instead of low-contrast accents. Dark syntax retains upstream accents; a separate contrast/visual review remains required before release.

## Upstream license

MIT License

Copyright (c) 2019 sainnhe

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
