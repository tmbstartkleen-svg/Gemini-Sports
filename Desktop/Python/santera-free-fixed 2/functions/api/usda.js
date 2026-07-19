const USDA_PAGE_URL =
  "https://r.jina.ai/https://www.fsis.usda.gov/recalls";

const CUTOFF_DATE = new Date("2026-03-01T00:00:00.000Z");

function clean(value = "") {
  return String(value)
    .replace(/\r/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function makeId(value = "") {
  return (
    "USDA-" +
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 90)
  );
}

function priorityFromText(text = "") {
  const value = text.toLowerCase();

  if (
    value.includes("listeria") ||
    value.includes("salmonella") ||
    value.includes("e. coli") ||
    value.includes("class i") ||
    value.includes("without benefit of inspection")
  ) {
    return "Critical";
  }

  if (
    value.includes("undeclared allergen") ||
    value.includes("unreported allergen") ||
    value.includes("foreign material") ||
    value.includes("product contamination") ||
    value.includes("misbranding")
  ) {
    return "High";
  }

  return "Medium";
}

function normalizeDate(value = "") {
  const cleaned = clean(value);

  if (!cleaned) {
    return null;
  }

  const parsed = new Date(cleaned);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

function extractRecallNumber(block = "") {
  const match = block.match(
    /\b(?:PHA-\d{8}-\d{2}|\d{3}-\d{4}(?:-EXP)?)\b/i
  );

  return match ? match[0].toUpperCase() : "";
}

function extractDate(block = "") {
  const patterns = [
    /\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),?\s+[A-Z][a-z]{2}\s+\d{1,2},\s+2026\b/,
    /\b[A-Z][a-z]+\s+\d{1,2},\s+2026\b/,
    /\b\d{1,2}\/\d{1,2}\/2026\b/,
  ];

  for (const pattern of patterns) {
    const match = block.match(pattern);

    if (match) {
      return normalizeDate(match[0]);
    }
  }

  return null;
}

function extractClassification(block = "") {
  const match = block.match(/\b(?:High|Low)\s*-\s*Class\s+[I|V|X]+\b/i);

  if (match) {
    return clean(match[0]);
  }

  if (/public health alert/i.test(block)) {
    return "Public Health Alert";
  }

  return "";
}

function extractStatus(block = "") {
  if (/\bActive\b/i.test(block)) {
    return "Active";
  }

  if (/\bClosed\b/i.test(block)) {
    return "Closed";
  }

  return "";
}

function extractHazard(block = "") {
  const hazards = [
    "Product Contamination",
    "Unreported Allergens",
    "Misbranding",
    "Foreign Material",
    "Processing Defect",
    "Produced Without Benefit of Inspection",
  ];

  return hazards.find((hazard) =>
    block.toLowerCase().includes(hazard.toLowerCase())
  ) || "";
}

function extractCompany(title = "", block = "") {
  const titlePatterns = [
    /^(.+?)\s+Recalls\b/i,
    /^FSIS Issues Public Health Alert for (.+?) Product/i,
  ];

  for (const pattern of titlePatterns) {
    const match = title.match(pattern);

    if (match) {
      return clean(match[1]);
    }
  }

  const establishmentMatch = block.match(
    /(?:company|establishment|firm)\s+([A-Z][^,\n.]{2,80})/i
  );

  return establishmentMatch ? clean(establishmentMatch[1]) : "";
}

function splitIntoBlocks(text = "") {
  const marker =
    /(?=\b(?:PHA-\d{8}-\d{2}|\d{3}-\d{4}(?:-EXP)?)\b)/gi;

  return text
    .split(marker)
    .map(clean)
    .filter((block) => block.length > 60);
}

function extractTitle(block = "") {
  const lines = block
    .split("\n")
    .map(clean)
    .filter(Boolean);

  const titleLine = lines.find((line) => {
    const lower = line.toLowerCase();

    return (
      lower.includes("recalls") ||
      lower.includes("public health alert")
    );
  });

  if (titleLine) {
    return titleLine
      .replace(/^\[[^\]]+\]\([^)]+\)\s*/, "")
      .replace(/^#+\s*/, "")
      .trim();
  }

  const sentenceMatch = block.match(
    /(?:FSIS Issues Public Health Alert|.+? Recalls)[^\n.]{10,240}/i
  );

  return sentenceMatch
    ? clean(sentenceMatch[0])
    : "USDA FSIS Recall or Public Health Alert";
}

function extractSourceUrl(block = "") {
  const links = [...block.matchAll(/\((https:\/\/www\.fsis\.usda\.gov\/[^)]+)\)/gi)];

  const recallLink = links.find((match) =>
    /recalls-alerts/i.test(match[1])
  );

  return recallLink
    ? recallLink[1]
    : "https://www.fsis.usda.gov/recalls";
}

function parseRecallBlocks(text = "") {
  const blocks = splitIntoBlocks(text);
  const seen = new Set();
  const results = [];

  for (const block of blocks) {
    const recallNumber = extractRecallNumber(block);

    if (!recallNumber || seen.has(recallNumber)) {
      continue;
    }

    const publishedDate = extractDate(block);

    if (!publishedDate) {
      continue;
    }

    if (new Date(publishedDate) < CUTOFF_DATE) {
      continue;
    }

    const title = extractTitle(block);
    const classification = extractClassification(block);
    const hazard = extractHazard(block);
    const company = extractCompany(title, block);
    const status = extractStatus(block);
    const sourceUrl = extractSourceUrl(block);

    const description = clean(
      block
        .replace(recallNumber, "")
        .replace(title, "")
        .slice(0, 2500)
    );

    const record = {
      id: makeId(recallNumber),
      source: "USDA",
      recall_number: recallNumber,
      title,
      company,
      classification,
      hazard,
      status,
      description,
      source_url: sourceUrl,
      published_date: publishedDate,
      priority: priorityFromText(
        `${title} ${classification} ${hazard} ${description}`
      ),
      raw_type: /public health alert/i.test(block)
        ? "Public Health Alert"
        : "Recall",
    };

    results.push(record);
    seen.add(recallNumber);
  }

  return results.sort(
    (a, b) =>
      new Date(b.published_date).getTime() -
      new Date(a.published_date).getTime()
  );
}

export async function onRequestGet() {
  try {
    const response = await fetch(USDA_PAGE_URL, {
      headers: {
        Accept: "text/plain",
        "User-Agent": "Santera USDA Intelligence/0.4",
      },
      cf: {
        cacheTtl: 900,
        cacheEverything: true,
      },
    });

    if (!response.ok) {
      throw new Error(`USDA reader returned ${response.status}`);
    }

    const text = await response.text();
    const results = parseRecallBlocks(text);

    return Response.json(
      {
        source: "USDA FSIS recalls page",
        access_method: "Jina Reader fallback",
        cutoff_date: "2026-03-01",
        count: results.length,
        results,
      },
      {
        headers: {
          "Cache-Control": "public, max-age=900",
          "Content-Type": "application/json; charset=utf-8",
        },
      }
    );
  } catch (error) {
    return Response.json(
      {
        source: "USDA FSIS recalls page",
        cutoff_date: "2026-03-01",
        count: 0,
        results: [],
        error: String(error),
      },
      {
        status: 502,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
        },
      }
    );
  }
}