import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dimsFromText, parseLength, parseProductPage, guessCategory, findModelUrls } from '../src/scrape.js';

const near = (a, b, tol = 0.006) => assert.ok(a != null && Math.abs(a - b) < tol, `${a} ≉ ${b}`);

test('labelled metric dimensions, skipping seat and package sizes', () => {
  const { dims } = dimsFromText('Seat depth: 60 cm Width: 228 cm Depth: 95 cm Height: 83 cm Seat height: 45 cm Package Width: 40 cm');
  near(dims.w, 2.28);
  near(dims.d, 0.95);
  near(dims.h, 0.83);
});

test('inch triplets with letters in any order', () => {
  const { dims } = dimsFromText('Product Dimensions 35"D x 80"W x 33"H');
  near(dims.w, 80 * 0.0254);
  near(dims.d, 35 * 0.0254);
  near(dims.h, 33 * 0.0254);
});

test('letter-prefixed triplet with trailing unit', () => {
  const { dims } = dimsFromText('Size: W 200 x D 90 x H 75 cm');
  near(dims.w, 2.0);
  near(dims.d, 0.9);
  near(dims.h, 0.75);
});

test('unlabelled triplet after an L x W x H header', () => {
  const { dims } = dimsFromText('Dimensions (L x W x H): 180 x 80 x 76 cm');
  near(dims.w, 1.8);
  near(dims.d, 0.8);
  near(dims.h, 0.76);
});

test('ignores package dimensions triplet', () => {
  const { dims } = dimsFromText('Package dimensions: 100 x 50 x 20 cm. Overall: 160 x 70 x 74 cm');
  near(dims.w, 1.6);
});

test('fractions, mm and feet+inches', () => {
  near(parseLength('31 1/2"'), 31.5 * 0.0254);
  near(parseLength('750 mm'), 0.75);
  near(parseLength(`6' 2"`), 6 * 0.3048 + 2 * 0.0254);
  near(parseLength({ value: 80, unitCode: 'CMT' }), 0.8);
});

test('JSON-LD ProductGroup with colour variants', async () => {
  const html = `<html><head><title>x</title>
  <script type="application/ld+json">{"@context":"https://schema.org","@type":"ProductGroup","name":"Harlow 3-Seater Sofa",
  "image":"/img/harlow.jpg","offers":{"price":"899","priceCurrency":"USD"},
  "width":{"@type":"QuantitativeValue","value":213,"unitCode":"CMT"},
  "depth":{"value":92,"unitCode":"CMT"},"height":"84 cm",
  "hasVariant":[{"@type":"Product","color":"Sage Green","image":"/img/g.jpg"},{"@type":"Product","color":"Oatmeal"},{"@type":"Product","color":"Charcoal"}]}</script>
  </head><body></body></html>`;
  const r = await parseProductPage(html, 'https://shop.example.com/harlow');
  assert.equal(r.name, 'Harlow 3-Seater Sofa');
  assert.equal(r.category, 'sofa');
  near(r.dims.w, 2.13);
  near(r.dims.d, 0.92);
  near(r.dims.h, 0.84);
  assert.deepEqual(r.colors.map((c) => c.name), ['Sage Green', 'Oatmeal', 'Charcoal']);
  assert.ok(r.colors.every((c) => /^#[0-9a-f]{6}$/.test(c.hex)));
  assert.equal(r.image, 'https://shop.example.com/img/harlow.jpg');
});

test('IKEA-style page: text dimensions and swatches', async () => {
  const html = `<html><head><meta property="og:title" content="KIVIK 3-seat sofa, Tresund light beige - IKEA">
  <meta property="og:image" content="https://www.ikea.com/kivik.jpg"></head><body>
  <div class="pip-product-styles"><a class="pip-swatch" aria-label="Tresund light beige"></a><a class="pip-swatch" aria-label="Gunnared dark grey"></a><a class="pip-swatch" aria-label="Kelinge grey-turquoise"></a></div>
  <h2>Measurements</h2><dl><dt>Width:</dt><dd>228 cm</dd><dt>Depth:</dt><dd>95 cm</dd><dt>Height:</dt><dd>83 cm</dd><dt>Seat depth:</dt><dd>60 cm</dd></dl>
  <h3>Packaging</h3><p>Width: 61 cm Height: 36 cm Length: 100 cm</p></body></html>`;
  const r = await parseProductPage(html, 'https://www.ikea.com/us/en/p/kivik-sofa-tresund-light-beige-s19482842/');
  assert.equal(r.category, 'sofa');
  assert.equal(r.name, 'KIVIK 3-seat sofa, Tresund light beige');
  near(r.dims.w, 2.28);
  near(r.dims.d, 0.95);
  near(r.dims.h, 0.83);
  assert.equal(r.colors.length, 3);
});

test('Amazon-style details table and twister colours', async () => {
  const html = `<span id="productTitle">  Modern Coffee Table with Storage, Rustic Brown  </span>
  <table><tr><th> Product Dimensions </th><td> 47.2"L x 23.6"W x 18.1"H </td></tr>
  <tr><th> Package Dimensions </th><td> 50 x 26 x 6 inches </td></tr></table>
  <script>var data = {"variationValues":{"color_name":["Rustic Brown","Black Oak","White"]}};</script>`;
  const r = await parseProductPage(html, 'https://www.amazon.com/dp/B000000');
  assert.equal(r.source, 'amazon');
  assert.equal(r.category, 'coffeetable');
  near(r.dims.w, 47.2 * 0.0254);
  near(r.dims.d, 23.6 * 0.0254);
  near(r.dims.h, 18.1 * 0.0254);
  assert.deepEqual(r.colors.map((c) => c.name), ['Rustic Brown', 'Black Oak', 'White']);
});

test('Shopify JSON endpoint with GLB media', async () => {
  const fakeFetch = async (url) => {
    assert.match(url, /\/products\/oak-desk\.js$/);
    return {
      ok: true, status: 200, url,
      text: async () => JSON.stringify({
        title: 'Oak Writing Desk', vendor: 'Studio', type: 'Desks', price: 45000,
        featured_image: '//cdn.shopify.com/desk.jpg',
        description: '<p>Dimensions: W 120 x D 60 x H 75 cm</p>',
        options: [{ name: 'Finish' }],
        variants: [{ option1: 'Natural Oak', title: 'Natural Oak' }, { option1: 'Walnut', title: 'Walnut' }],
        media: [{ media_type: 'model', sources: [{ format: 'usdz', url: 'https://cdn.shopify.com/d.usdz' }, { format: 'glb', url: 'https://cdn.shopify.com/d.glb' }] }],
      }),
    };
  };
  const r = await parseProductPage('<html><script src="https://cdn.shopify.com/x.js"></script></html>', 'https://studio.example/products/oak-desk', { fetchImpl: fakeFetch });
  assert.equal(r.source, 'shopify');
  assert.equal(r.category, 'desk');
  near(r.dims.w, 1.2);
  near(r.dims.h, 0.75);
  assert.equal(r.modelUrl, 'https://cdn.shopify.com/d.glb');
  assert.deepEqual(r.colors.map((c) => c.name), ['Natural Oak', 'Walnut']);
});

test('finds model-viewer and escaped glb URLs', () => {
  const urls = findModelUrls('<model-viewer src="/m/chair.glb"></model-viewer> {"u":"https:\\/\\/cdn.x.com\\/a\\/lamp.glb?v=2"}', 'https://x.com/p');
  assert.deepEqual(urls.sort(), ['https://cdn.x.com/a/lamp.glb?v=2', 'https://x.com/m/chair.glb'].sort());
});

test('category guessing prefers the title', () => {
  assert.equal(guessCategory('Walnut Coffee Table', 'Living Room > Sofas'), 'coffeetable');
  assert.equal(guessCategory('Velvet accent chair'), 'armchair');
  assert.equal(guessCategory('BILLY Bookcase'), 'bookshelf');
  assert.equal(guessCategory('Mystery object'), 'box');
});
