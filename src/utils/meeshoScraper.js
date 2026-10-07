/**
 * Utility to extract and parse product details from Meesho URLs
 */

function extractMeeshoProductId(urlStr) {
  if (!urlStr) return null;
  const match = urlStr.match(/\/p\/([a-zA-Z0-9_-]+)/i) || urlStr.match(/\/s\/p\/([a-zA-Z0-9_-]+)/i);
  return match ? match[1] : null;
}

function extractSlugFromUrl(urlStr) {
  if (!urlStr) return '';
  try {
    const parsed = new URL(urlStr);
    const path = parsed.pathname;
    const parts = path.split('/').filter(Boolean);
    const pIndex = parts.indexOf('p');
    if (pIndex > 0) {
      return parts[pIndex - 1];
    }
  } catch (e) {
    // ignore
  }
  return '';
}

function formatTitleFromSlug(slug) {
  if (!slug || slug === 's') return '';
  return slug
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (l) => l.toUpperCase())
    .trim();
}

/**
 * Scrapes product details from a Meesho product URL
 * @param {string} meeshoUrl 
 */
async function fetchMeeshoProductDetails(meeshoUrl) {
  if (!meeshoUrl || typeof meeshoUrl !== 'string') {
    throw new Error('Please provide a valid Meesho product URL');
  }

  const cleanUrl = meeshoUrl.trim();
  if (!cleanUrl.includes('meesho.com')) {
    throw new Error('URL must be a valid meesho.com link');
  }

  const productId = extractMeeshoProductId(cleanUrl);
  const slug = extractSlugFromUrl(cleanUrl);
  const slugTitle = formatTitleFromSlug(slug);

  // Candidate URLs to attempt fetching
  const candidateUrls = [
    productId ? `https://www.meesho.com/p/${productId}` : null,
    productId ? `https://meesho.com/p/${productId}` : null,
    cleanUrl,
    productId ? `https://www.meesho.com/s/p/${productId}` : null,
  ].filter((u, i, arr) => u && arr.indexOf(u) === i);

  const headerSets = [
    {
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'accept-language': 'en-IN,en-GB;q=0.9,en-US;q=0.8,en;q=0.7',
      'sec-ch-ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'sec-fetch-dest': 'document',
      'sec-fetch-mode': 'navigate',
      'sec-fetch-site': 'none',
      'sec-fetch-user': '?1',
      'upgrade-insecure-requests': '1',
      'referer': 'https://www.google.com/'
    },
    {
      'user-agent': 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
      'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'accept-language': 'en-IN,en;q=0.9',
      'sec-ch-ua': '"Chromium";v="124", "Android WebView";v="124"',
      'sec-ch-ua-mobile': '?1',
      'sec-ch-ua-platform': '"Android"',
      'sec-fetch-dest': 'document',
      'sec-fetch-mode': 'navigate',
      'sec-fetch-site': 'cross-site',
      'referer': 'https://www.google.com/'
    },
    {
      'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/605.1.15',
      'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': 'en-US,en;q=0.9',
      'referer': 'https://www.google.com/'
    }
  ];

  let html = '';

  for (const urlCandidate of candidateUrls) {
    for (const headers of headerSets) {
      try {
        const res = await fetch(urlCandidate, {
          headers,
          redirect: 'follow'
        });

        if (res.status === 200 || res.status === 301 || res.status === 302) {
          const text = await res.text();
          if (text && text.length > 3000 && !text.includes('Access Denied')) {
            html = text;
            break;
          }
        }
      } catch (err) {
        // continue trying next candidate
      }
    }
    if (html) break;
  }

  // Parse extracted values
  let name = '';
  let description = '';
  let price = 0;
  let originalPrice = 0;
  let brand = '';
  let category = '';
  let subcategory = '';
  let fetchedImages = [];
  let sizeVariants = [];
  let sizes = [];
  let highlights = [];
  let additionalDetailsObj = {};
  let moreInformation = {
    manufacturer: '',
    importer: '',
    packer: '',
    netWeight: ''
  };

  if (html) {
    // Helper to traverse object deeply for target keys
    function deepFindProductData(obj) {
      if (!obj || typeof obj !== 'object') return null;
      if (obj.name || obj.title || obj.variations || obj.sizes || obj.product_attributes) {
        return obj;
      }
      for (const key of Object.keys(obj)) {
        if (typeof obj[key] === 'object') {
          const found = deepFindProductData(obj[key]);
          if (found && (found.name || found.variations || found.sizes || found.product_attributes)) return found;
        }
      }
      return null;
    }

    // 1. Try extracting __NEXT_DATA__
    const nextDataMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s);
    if (nextDataMatch) {
      try {
        const nextJson = JSON.parse(nextDataMatch[1]);
        const pageProps = nextJson.props?.pageProps;
        const initialState = pageProps?.initialState;

        const pData = initialState?.product || pageProps?.productData || pageProps?.productDetails || deepFindProductData(pageProps);

        if (pData) {
          if (pData.name || pData.title) name = pData.name || pData.title;
          if (pData.description) description = pData.description;
          if (pData.price) price = Number(pData.price);
          if (pData.original_price || pData.mrp) originalPrice = Number(pData.original_price || pData.mrp);
          if (pData.brand) brand = pData.brand;
          if (pData.category_name) category = pData.category_name;
          if (pData.subcategory_name) subcategory = pData.subcategory_name;

          if (Array.isArray(pData.images)) {
            fetchedImages = pData.images.map((img) => (typeof img === 'string' ? img : img.url || img.url_full || ''));
          }

          // Parse Variations & Size-wise prices from pData
          const vars = pData.variations || pData.variants || pData.sizes || pData.size_variants;
          if (Array.isArray(vars) && vars.length > 0) {
            vars.forEach((v) => {
              const szName = v.name || v.size || v.variant_name || v.value || '';
              const szPrice = Number(v.price || v.app_price || v.discounted_price || price);
              const szMrp = Number(v.mrp || v.original_price || originalPrice || Math.round(szPrice * 1.25));
              const szAvailable = v.in_stock !== false && v.available !== false && v.is_available !== false;
              if (szName) {
                sizeVariants.push({
                  size: String(szName).trim(),
                  price: szPrice,
                  originalPrice: szMrp,
                  isAvailable: szAvailable
                });
                sizes.push(String(szName).trim());
              }
            });
          }

          // Parse Product Highlights from pData
          const attrs = pData.product_attributes || pData.attributes || pData.highlights || pData.key_features;
          if (Array.isArray(attrs)) {
            attrs.forEach((attr) => {
              if (typeof attr === 'string') {
                highlights.push(attr);
              } else if (attr && typeof attr === 'object') {
                const k = attr.name || attr.key || attr.title || '';
                const v = attr.value || attr.val || '';
                if (k && v) {
                  highlights.push(`${k}: ${v}`);
                }
              }
            });
          } else if (attrs && typeof attrs === 'object') {
            Object.entries(attrs).forEach(([k, v]) => {
              if (k && v) highlights.push(`${k}: ${v}`);
            });
          }

          // Parse Compliance / Supplier Details (More Information)
          const compliance = pData.compliance || pData.supplier || pData.manufacturer || pData.more_info || pData.additional_info;
          if (compliance && typeof compliance === 'object') {
            if (compliance.manufacturer || compliance.manufacturer_name || compliance.manufacturer_address) {
              moreInformation.manufacturer = compliance.manufacturer || `${compliance.manufacturer_name || ''} ${compliance.manufacturer_address || ''}`.trim();
            }
            if (compliance.importer || compliance.importer_name || compliance.importer_address) {
              moreInformation.importer = compliance.importer || `${compliance.importer_name || ''} ${compliance.importer_address || ''}`.trim();
            }
            if (compliance.packer || compliance.packer_name || compliance.packer_address) {
              moreInformation.packer = compliance.packer || `${compliance.packer_name || ''} ${compliance.packer_address || ''}`.trim();
            }
            if (compliance.net_weight || compliance.weight) {
              moreInformation.netWeight = String(compliance.net_weight || compliance.weight).trim();
            }
          }
        }
      } catch (e) {
        console.warn('Error parsing __NEXT_DATA__:', e.message);
      }
    }

    // 2. Try JSON-LD script extraction
    const jsonLdMatches = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/gs) || [];
    jsonLdMatches.forEach((scriptStr) => {
      try {
        const cleanStr = scriptStr.replace(/<script[^>]*>/i, '').replace(/<\/script>/i, '').trim();
        const ldJson = JSON.parse(cleanStr);
        if (ldJson['@type'] === 'Product' || ldJson.name) {
          if (!name) name = ldJson.name;
          if (!description && ldJson.description) description = ldJson.description;
          if (!brand && ldJson.brand?.name) brand = ldJson.brand.name;
          if (!price && ldJson.offers?.price) price = Number(ldJson.offers.price);
        }
      } catch (e) {
        // ignore
      }
    });

    // 3. Extract meta tags for fallback basic info
    if (!name) {
      const titleTag = html.match(/<title[^>]*>(.*?)<\/title>/i);
      const ogTitle = html.match(/<meta\s+property=["']og:title["']\s+content=["'](.*?)["']/i) || html.match(/<meta\s+content=["'](.*?)["']\s+property=["']og:title["']/i);
      const nameMatch = ogTitle ? ogTitle[1] : (titleTag ? titleTag[1] : '');
      if (nameMatch && !nameMatch.includes('Not Found') && !nameMatch.includes('Access Denied')) {
        name = nameMatch.replace(/\|.*$/g, '').replace(/- Buy.*$/gi, '').trim();
      }
    }

    if (!description) {
      const metaDesc = html.match(/<meta\s+name=["']description["']\s+content=["'](.*?)["']/i) || html.match(/<meta\s+content=["'](.*?)["']\s+name=["']description["']/i);
      const ogDesc = html.match(/<meta\s+property=["']og:description["']\s+content=["'](.*?)["']/i) || html.match(/<meta\s+content=["'](.*?)["']\s+property=["']og:description["']/i);
      const descVal = metaDesc ? metaDesc[1] : (ogDesc ? ogDesc[1] : '');
      if (descVal && !descVal.includes('couldn’t find the page')) {
        description = descVal;
      }
    }

    if (!price) {
      const priceMeta = html.match(/<meta\s+property=["'](?:product:price:amount|og:price:amount)["']\s+content=["'](.*?)["']/i);
      if (priceMeta) {
        price = Number(priceMeta[1]);
      } else {
        const priceTextMatch = html.match(/₹\s*([0-9,]+)/) || html.match(/RS\.?\s*([0-9,]+)/i);
        if (priceTextMatch) {
          price = Number(priceTextMatch[1].replace(/,/g, ''));
        }
      }
    }

    // Extract Images from HTML
    if (fetchedImages.length === 0) {
      const ogImage = html.match(/<meta\s+property=["']og:image["']\s+content=["'](.*?)["']/i) || html.match(/<meta\s+content=["'](.*?)["']\s+property=["']og:image["']/i);
      if (ogImage && ogImage[1] && !ogImage[1].includes('meesho-logo')) {
        fetchedImages.push(ogImage[1]);
      }

      const cdnImgMatches = html.match(/https:\/\/[^"'\s<>]*(?:images\.meesho|meeshostatic|static\.meesho)[^"'\s<>]*\.(?:jpg|jpeg|png|webp)/gi) || [];
      const uniqueCdnImgs = Array.from(new Set(cdnImgMatches)).filter((img) => !img.includes('logo') && !img.includes('icon'));
      fetchedImages = Array.from(new Set([...fetchedImages, ...uniqueCdnImgs])).slice(0, 8);
    }

    // 4. HTML Regex DOM Fallback Parsing for Size Pills with Prices
    if (sizeVariants.length === 0) {
      // Look for size pills in HTML e.g., IND-6 ₹249, IND-7 ₹269, XXS ₹224, S ₹231, etc.
      const sizePillRegex = /\b(IND-[0-9]{1,2}|UK-[0-9]{1,2}|EU-[0-9]{2}|US-[0-9]{1,2}|XXS|XS|XXXL|XXXXL|24|26|28|30|32|34|36|38|40|42|44|46|48|50|S|M|L|XL|XXL|Free Size)\b[\s\S]{0,80}?₹\s*([0-9,]+)/gi;
      let match;
      const seenSizes = new Set();
      while ((match = sizePillRegex.exec(html)) !== null) {
        const sz = match[1].trim();
        const pr = Number(match[2].replace(/,/g, ''));
        if (sz && pr > 50 && !seenSizes.has(sz)) {
          seenSizes.add(sz);
          sizeVariants.push({
            size: sz,
            price: pr,
            originalPrice: Math.round(pr * 1.25),
            isAvailable: true
          });
          sizes.push(sz);
        }
      }

      // Also match standalone shoe sizes e.g. IND-6, IND-7 if prices were not matched inline
      if (sizeVariants.length === 0) {
        const shoeMatches = html.match(/\b(IND-[5-9]|IND-1[0-2])\b/gi) || [];
        const uniqueShoeSizes = Array.from(new Set(shoeMatches)).map((s) => s.toUpperCase());
        if (uniqueShoeSizes.length > 0) {
          const baseP = price || 299;
          uniqueShoeSizes.forEach((sz, idx) => {
            sizeVariants.push({
              size: sz,
              price: baseP + idx * 10,
              originalPrice: Math.round((baseP + idx * 10) * 1.25),
              isAvailable: true
            });
            sizes.push(sz);
          });
        }
      }
    }

    // 5. HTML Regex DOM Fallback Parsing for Product Highlights
    if (highlights.length === 0) {
      const highlightPairs = [
        ['Color', html.match(/Color[\s\S]{0,30}?(?:">|:)\s*([A-Za-z\s]{2,20})/i)],
        ['Waist Rise', html.match(/Waist\s*Rise[\s\S]{0,30}?(?:">|:)\s*([A-Za-z\s]{2,20})/i)],
        ['Stretch', html.match(/Stretch[\s\S]{0,30}?(?:">|:)\s*([A-Za-z\s]{2,20})/i)],
        ['Fit/ Shape', html.match(/Fit\/?\s*Shape[\s\S]{0,30}?(?:">|:)\s*([A-Za-z\s]{2,20})/i)],
        ['Pattern', html.match(/Pattern[\s\S]{0,30}?(?:">|:)\s*([A-Za-z\s]{2,20})/i)],
        ['Material', html.match(/Material[\s\S]{0,30}?(?:">|:)\s*([A-Za-z\s]{2,20})/i)],
        ['Fabric', html.match(/Fabric[\s\S]{0,30}?(?:">|:)\s*([A-Za-z\s]{2,20})/i)]
      ];

      highlightPairs.forEach(([key, m]) => {
        if (m && m[1] && m[1].trim() && !m[1].includes('<')) {
          highlights.push(`${key}: ${m[1].trim()}`);
        }
      });
    }

    // 6. HTML Regex DOM Fallback Parsing for Additional Details
    const detailFields = ['Length', 'Distress', 'Fabric', 'Net Quantity (N)', 'Wash', 'Surface Styling', 'Shade', 'Brand', 'Generic Name', 'Country of Origin'];
    detailFields.forEach((field) => {
      const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const reg = new RegExp(`${escaped}[\\s\\S]{0,40}?(?:">|:)\\s*([A-Za-z0-9\\s\\-\\(\\)]{1,35})`, 'i');
      const m = html.match(reg);
      if (m && m[1] && m[1].trim() && !m[1].includes('<')) {
        const val = m[1].trim();
        additionalDetailsObj[field] = val;
        if (field === 'Brand' && !brand) brand = val;
      }
    });

    // 7. HTML Regex DOM Fallback Parsing for More Information (Manufacturer / Importer / Packer / Net Weight)
    if (!moreInformation.manufacturer) {
      const mMatch = html.match(/Manufacturer\s*Information[\s\S]{0,120}?(?:">|:)\s*([^<]{5,150})/i);
      if (mMatch && mMatch[1]) moreInformation.manufacturer = mMatch[1].trim();
    }
    if (!moreInformation.importer) {
      const iMatch = html.match(/Importer\s*Information[\s\S]{0,120}?(?:">|:)\s*([^<]{5,150})/i);
      if (iMatch && iMatch[1]) moreInformation.importer = iMatch[1].trim();
    }
    if (!moreInformation.packer) {
      const pMatch = html.match(/Packer\s*Information[\s\S]{0,120}?(?:">|:)\s*([^<]{5,150})/i);
      if (pMatch && pMatch[1]) moreInformation.packer = pMatch[1].trim();
    }
    if (!moreInformation.netWeight) {
      const wMatch = html.match(/Net\s*Weight(?:\(g\))?[\s\S]{0,50}?(?:">|:)\s*([0-9]{1,6}\s*(?:g|grm|grams)?)/i);
      if (wMatch && wMatch[1]) moreInformation.netWeight = wMatch[1].trim();
    }
  }

  // Fallbacks if basic info was missing
  if (!name) {
    name = slugTitle || (productId ? `Meesho Product (${productId})` : 'Meesho Product');
  }

  if (description) {
    description = description
      .replace(/Imported from Meesho catalog link \([^)]*\)\.?/gi, '')
      .replace(/Imported from Meesho[^\n.]*\.?/gi, '')
      .replace(/https?:\/\/(?:www\.)?meesho\.com[^\s)]*/gi, '')
      .trim();
  }

  if (!description) {
    description = 'Crafted using premium materials to ensure continuous reliability, sleek aesthetics, and superior satisfaction. Designed to match modern lifestyles with ease.';
  }

  // Build string representation for additionalDetails
  let additionalDetails = Object.entries(additionalDetailsObj)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');

  if (!additionalDetails) {
    if (description && description.includes(':')) {
      const lines = description.split(/\r?\n|;/);
      const extracted = [];
      lines.forEach((l) => {
        if (l.includes(':') && l.length < 100) extracted.push(l.trim());
      });
      if (extracted.length > 0) {
        additionalDetails = extracted.join('\n');
      }
    }
  }

  if (!additionalDetails) {
    additionalDetails = 'Length: Regular\nFabric: Premium Quality\nNet Quantity (N): 1\nGeneric Name: Product\nCountry of Origin: India';
  }

  if (!brand) {
    brand = 'LEETOS';
  }

  // Ensure price has a valid default
  if (!price || isNaN(price)) {
    price = sizeVariants.length > 0 && sizeVariants[0].price ? sizeVariants[0].price : 271;
  }

  if (!originalPrice || originalPrice < price) {
    originalPrice = Math.round(price * 1.25);
  }

  // Infer Category & Subcategory
  const textContent = `${name} ${description} ${cleanUrl}`.toLowerCase();
  if (textContent.includes('jeans') || textContent.includes('trouser') || textContent.includes('plazzo')) {
    category = 'bottomwear';
    subcategory = 'Jeans & Trousers';
  } else if (textContent.includes('saree')) {
    category = 'sarees';
    subcategory = 'Banarasi / Silk Sarees';
  } else if (textContent.includes('earring') || textContent.includes('jhumka')) {
    category = 'earrings';
    subcategory = 'Earrings & Jewelry';
  } else if (textContent.includes('dress') || textContent.includes('gown') || textContent.includes('frock')) {
    category = 'dresses';
    subcategory = 'Women Dresses';
  } else if (textContent.includes('kurti') || textContent.includes('suit')) {
    category = 'kurtis';
    subcategory = 'Kurtis & Suits';
  } else if (textContent.includes('bangle') || textContent.includes('bracelet')) {
    category = 'bangles';
    subcategory = 'Bangles & Bracelets';
  } else if (textContent.includes('necklace') || textContent.includes('chain')) {
    category = 'necklaces';
    subcategory = 'Necklaces & Chains';
  } else if (textContent.includes('shirt') || textContent.includes('t-shirt') || textContent.includes('top')) {
    category = 'tops';
    subcategory = 'Tops & Shirts';
  } else {
    category = category || 'general';
    subcategory = subcategory || 'General Catalog';
  }



  // Deduplicate and resolve sizes & sizeVariants
  if (sizeVariants.length > 0) {
    const seen = new Set();
    const uniqueVars = [];
    sizeVariants.forEach((sv) => {
      const szName = String(sv.size || '').trim();
      if (szName && !seen.has(szName.toLowerCase())) {
        seen.add(szName.toLowerCase());
        uniqueVars.push({
          size: szName,
          price: Number(sv.price || price),
          originalPrice: Number(sv.originalPrice || Math.round((sv.price || price) * 1.25)),
          isAvailable: sv.isAvailable !== false
        });
      }
    });
    sizeVariants = uniqueVars;
    sizes = sizeVariants.map((sv) => sv.size);
  } else if (sizes.length > 0) {
    const uniqueSizes = Array.from(new Set(sizes.map((s) => String(s).trim()))).filter(Boolean);
    const baseP = price || 271;
    sizeVariants = uniqueSizes.map((sz) => ({
      size: sz,
      price: baseP,
      originalPrice: Math.round(baseP * 1.25),
      isAvailable: true
    }));
    sizes = uniqueSizes;
  }

  // If sizes are missing, infer intelligent category-specific size variants
  if (sizes.length === 0 || sizeVariants.length === 0) {
    let defaultSizeList = ['S', 'M', 'L', 'XL', 'XXL'];

    if (category === 'bottomwear' || textContent.includes('jeans') || textContent.includes('trouser') || textContent.includes('pants') || textContent.includes('shorts')) {
      defaultSizeList = ['28', '30', '32', '34', '36'];
    } else if (textContent.includes('shoe') || textContent.includes('sandal') || textContent.includes('sneaker') || textContent.includes('footwear') || textContent.includes('slipper') || textContent.includes('heels')) {
      defaultSizeList = ['IND-6', 'IND-7', 'IND-8', 'IND-9', 'IND-10'];
    } else if (category === 'sarees' || category === 'earrings' || category === 'bangles' || category === 'necklaces' || textContent.includes('saree') || textContent.includes('jewelry') || textContent.includes('dupatta') || textContent.includes('bag') || textContent.includes('ring')) {
      defaultSizeList = ['Free Size'];
    }

    const baseP = price || 271;
    sizes = defaultSizeList;
    sizeVariants = defaultSizeList.map((sz, idx) => ({
      size: sz,
      price: baseP,
      originalPrice: Math.round(baseP * 1.25),
      isAvailable: true
    }));
  }

  return {
    name,
    description,
    price,
    originalPrice,
    brand,
    category,
    subcategory,
    highlights,
    additionalDetails,
    moreInformation,
    sizes,
    sizeVariants,
    fetchedImages,
    sourceUrl: cleanUrl,
    productId: productId || ''
  };
}

/**
 * Scrapes product reviews from a Meesho product URL
 * @param {string} meeshoUrl 
 * @param {number|string} countOption - 10, 20, 30, or 'all' (default 30)
 */
async function fetchMeeshoProductReviews(meeshoUrl, countOption = 30) {
  if (!meeshoUrl || typeof meeshoUrl !== 'string') {
    throw new Error('Please provide a valid Meesho product URL');
  }

  const cleanUrl = meeshoUrl.trim();
  if (!cleanUrl.includes('meesho.com')) {
    throw new Error('URL must be a valid meesho.com link');
  }

  // 1. Fetch product details first to get name, category, and gallery images
  let productDetails = null;
  try {
    productDetails = await fetchMeeshoProductDetails(cleanUrl);
  } catch (err) {
    // continue fallback
  }

  const productName = productDetails?.name || 'Meesho Product';
  const productImages = productDetails?.fetchedImages || [];

  // Parse target review count
  let targetCount = 30;
  if (countOption === '10' || countOption === 10) targetCount = 10;
  else if (countOption === '20' || countOption === 20) targetCount = 20;
  else if (countOption === '30' || countOption === 30) targetCount = 30;
  else if (countOption === 'all' || countOption === 'ALL' || countOption === 50) targetCount = 50;

  // Candidate URLs & Headers for scraping page HTML
  const productId = extractMeeshoProductId(cleanUrl);
  const candidateUrls = [
    productId ? `https://www.meesho.com/p/${productId}` : null,
    productId ? `https://meesho.com/p/${productId}` : null,
    cleanUrl,
    productId ? `https://www.meesho.com/s/p/${productId}` : null,
  ].filter((u, i, arr) => u && arr.indexOf(u) === i);

  const headerSets = [
    {
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'accept-language': 'en-IN,en-GB;q=0.9,en-US;q=0.8,en;q=0.7',
      'referer': 'https://www.google.com/'
    },
    {
      'user-agent': 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
      'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'accept-language': 'en-IN,en;q=0.9',
      'sec-ch-ua-mobile': '?1',
      'sec-ch-ua-platform': '"Android"',
      'referer': 'https://www.google.com/'
    }
  ];

  let html = '';
  for (const urlCandidate of candidateUrls) {
    for (const headers of headerSets) {
      try {
        const res = await fetch(urlCandidate, { headers, redirect: 'follow' });
        if (res.status === 200 || res.status === 301 || res.status === 302) {
          const text = await res.text();
          if (text && text.length > 3000 && !text.includes('Access Denied')) {
            html = text;
            break;
          }
        }
      } catch (err) {}
    }
    if (html) break;
  }

  const scrapedReviews = [];

  if (html) {
    // 1. Try __NEXT_DATA__
    const nextDataMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s);
    if (nextDataMatch) {
      try {
        const nextJson = JSON.parse(nextDataMatch[1]);
        const pageProps = nextJson.props?.pageProps;

        const avatarPool = [
          'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=150&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=150&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150&auto=format&fit=crop&q=80'
        ];

        function extractReviewsFromObj(obj) {
          if (!obj || typeof obj !== 'object') return;
          if (Array.isArray(obj)) {
            obj.forEach((item) => {
              if (item && typeof item === 'object') {
                const name = item.customer_name || item.author_name || item.user_name || item.author || item.name || item.reviewer || item.user?.name;
                const comment = item.comment || item.review_text || item.description || item.text || item.heading || item.review;
                const rating = Number(item.rating || item.ratings || item.stars || item.score || 5);

                if ((name || comment) && typeof comment === 'string' && comment.length > 3) {
                  // Customer profile photo extraction
                  const profileImg = item.profile_image || item.profile_photo || item.author_image || item.user_image || item.avatar || item.user?.profile_image || item.user?.image || item.user?.avatar || item.author?.image || item.customer_profile_image || item.reviewer_image || item.user?.profile_photo || item.user?.avatar_url || item.user?.photo || '';
                  const finalProfileImg = profileImg || avatarPool[scrapedReviews.length % avatarPool.length];

                  // Customer uploaded review photos extraction
                  let imgList = [];
                  const rawPhotos = item.images || item.photos || item.media || item.review_photos || item.review_images || item.attachments || item.customer_photos;
                  if (Array.isArray(rawPhotos)) {
                    imgList = rawPhotos.map((img) => (typeof img === 'string' ? img : img.url || img.image_url || img.full_url || img.cdn_url || ''));
                  } else if (item.image || item.photo || item.media_url) {
                    imgList = [item.image || item.photo || item.media_url];
                  }

                  if (imgList.filter(Boolean).length === 0 && productImages.length > 0) {
                    imgList = [productImages[scrapedReviews.length % productImages.length]];
                  }

                  const cleanImgList = imgList.filter(Boolean);

                  scrapedReviews.push({
                    id: 'meesho-rev-' + Math.random().toString(36).substring(2, 9),
                    customerName: String(name || 'Verified Buyer').trim(),
                    profileImage: finalProfileImg,
                    rating: Math.min(5, Math.max(1, rating || 5)),
                    comment: String(comment).trim(),
                    date: item.created_at || item.date || item.review_date || new Date().toISOString().split('T')[0],
                    image: cleanImgList[0] || '',
                    images: cleanImgList,
                    isRealScraped: true
                  });
                }
              }
            });
          } else {
            for (const key of Object.keys(obj)) {
              if (typeof obj[key] === 'object') {
                extractReviewsFromObj(obj[key]);
              }
            }
          }
        }

        extractReviewsFromObj(pageProps);
      } catch (e) {}
    }

    // 2. Try JSON-LD scripts
    const jsonLdMatches = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/gs) || [];
    jsonLdMatches.forEach((scriptStr) => {
      try {
        const cleanStr = scriptStr.replace(/<script[^>]*>/i, '').replace(/<\/script>/i, '').trim();
        const ldJson = JSON.parse(cleanStr);
        const reviewsArr = ldJson.review || (ldJson['@type'] === 'Review' ? [ldJson] : []);
        if (Array.isArray(reviewsArr)) {
          reviewsArr.forEach((r) => {
            const author = r.author?.name || r.author || 'Verified Buyer';
            const body = r.reviewBody || r.description || r.name;
            const ratingVal = Number(r.reviewRating?.ratingValue || 5);
            if (body) {
              const profileImg = r.author?.image || r.author?.avatar || avatarPool[scrapedReviews.length % avatarPool.length];
              let revPhotos = [];
              if (r.image) {
                revPhotos = Array.isArray(r.image) ? r.image : [r.image];
              } else if (productImages.length > 0) {
                revPhotos = [productImages[scrapedReviews.length % productImages.length]];
              }

              scrapedReviews.push({
                id: 'meesho-rev-' + Math.random().toString(36).substring(2, 9),
                customerName: String(author).trim(),
                profileImage: profileImg,
                rating: Math.min(5, Math.max(1, ratingVal || 5)),
                comment: String(body).trim(),
                date: r.datePublished || new Date().toISOString().split('T')[0],
                image: revPhotos[0] || '',
                images: revPhotos,
                isRealScraped: true
              });
            }
          });
        }
      } catch (e) {}
    });
  }

  // Deduplicate scraped reviews by comment text
  const seenComments = new Set();
  const uniqueScraped = [];
  scrapedReviews.forEach((rev) => {
    const key = rev.comment.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!seenComments.has(key)) {
      seenComments.add(key);
      uniqueScraped.push(rev);
    }
  });

  // Prepare seed templates to generate product-specific reviews if additional count is required
  const customerNamesPool = [
    'Priya Sharma', 'Ananya Verma', 'Rahul Mehta', 'Neha Gupta', 'Pooja Patel',
    'Rohan Singh', 'Sneha Das', 'Kavya Reddy', 'Aarav Joshi', 'Divya Nair',
    'Siddharth Malhotra', 'Meera Kapoor', 'Aditya Kumar', 'Simran Kaur', 'Deepak Yadav',
    'Ishita Roy', 'Vikram Choudhary', 'Ritu Saxena', 'Amitabh Bose', 'Shweta Tiwari',
    'Rajesh Kothari', 'Tanvi Shah', 'Karan Verma', 'Monika Agarwal', 'Suresh Menon',
    'Preeti Deshmukh', 'Manish Bansal', 'Shalini Mishra', 'Arjun Nambiar', 'Bhavna Joshi',
    'Nikhil Bhatt', 'Swati Mahajan', 'Varun Tandon', 'Sonam Rao', 'Gaurav Dubey',
    'Akanksha Tripathi', 'Tarun Jain', 'Nisha Pillai', 'Harish Chandra', 'Pallavi Sen',
    'Yashwardhan Shukla', 'Kriti Sangwan', 'Alok Pandey', 'Gayatri Iyer', 'Mayank Rastogi',
    'Richa Sengupta', 'Sourabh Mukherjee', 'Smriti Thakur', 'Abhinav Saxena', 'Komal Goel'
  ];

  const avatarPool = [
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=150&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=150&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150&auto=format&fit=crop&q=80'
  ];

  const reviewTemplatesPool = [
    { comment: `Superb quality product! The ${productName} fits perfectly and feels very comfortable. Extremely happy with this purchase.`, rating: 5 },
    { comment: `Fabric quality and finish are top-notch. Received the delivery in 3 days. Highly recommended!`, rating: 5 },
    { comment: `Exactly as shown in the pictures. The stitching and material quality exceed expectations for this price.`, rating: 5 },
    { comment: `Beautiful design and rich texture. Matches perfectly with my style. Really satisfied!`, rating: 5 },
    { comment: `Very nice product! Color is exact and fitting is spot on. Worth every single rupee.`, rating: 4 },
    { comment: `Great quality overall. Soft material, durable build, and neat packaging. Will buy again!`, rating: 5 },
    { comment: `Decent product, good value for money. Looks classy and premium.`, rating: 4 },
    { comment: `Must-buy item! Everyone complimented the fitting and look. 5 stars for fast delivery too.`, rating: 5 },
    { comment: `Outstanding product experience! Material is premium and feels very comfortable throughout the day.`, rating: 5 },
    { comment: `Prompt delivery and fantastic quality. Fits seamlessly as per the size chart.`, rating: 5 },
    { comment: `Very comfortable and stylish. Premium look at an affordable rate!`, rating: 4 },
    { comment: `Mind-blowing quality! The finish and durability are impressive. Fully satisfied customer!`, rating: 5 },
    { comment: `Received the exact same color and pattern as shown in the images. High quality product.`, rating: 5 },
    { comment: `Nice purchase. Packaging was very neat and safe. Would recommend to everyone.`, rating: 4 },
    { comment: `Amazing product! Looks elegant and feels very soft. Highly pleased with Meesho catalog quality.`, rating: 5 }
  ];

  const combinedReviews = [...uniqueScraped];

  // Fill up to targetCount if needed
  let seedIndex = 0;
  const now = new Date();

  while (combinedReviews.length < targetCount) {
    const name = customerNamesPool[seedIndex % customerNamesPool.length];
    const profilePic = avatarPool[seedIndex % avatarPool.length];
    const template = reviewTemplatesPool[seedIndex % reviewTemplatesPool.length];
    
    // Pick an image from product gallery if available
    let revImg = '';
    if (productImages.length > 0) {
      revImg = productImages[seedIndex % productImages.length];
    }

    const pastDate = new Date(now.getTime() - (seedIndex + 1) * 86400000 * 1.5);
    const dateStr = pastDate.toISOString().split('T')[0];

    combinedReviews.push({
      id: 'meesho-rev-' + (seedIndex + 1) + '-' + Math.random().toString(36).substring(2, 7),
      customerName: name,
      profileImage: profilePic,
      rating: template.rating,
      comment: template.comment,
      date: dateStr,
      image: revImg,
      images: revImg ? [revImg] : [],
      isRealScraped: false
    });

    seedIndex++;
  }

  const finalReviews = combinedReviews.slice(0, targetCount);

  return {
    success: true,
    totalAvailable: finalReviews.length,
    productName,
    productImages,
    sourceUrl: cleanUrl,
    reviews: finalReviews
  };
}

module.exports = {
  fetchMeeshoProductDetails,
  fetchMeeshoProductReviews
};

