import { Parser } from "json2csv";

export default async function handler(req: any, res: any) {
  try {
    const { data, format } = req.body;
    if (!data) {
      return res.status(400).send("No data provided for export");
    }

    if (format === "json") {
      res.setHeader("Content-Type", "application/json");
      res.send(JSON.stringify(data, null, 2));
    } else if (format === "csv") {
      const parser = new Parser();
      const csv = parser.parse(data);
      res.setHeader("Content-Type", "text/csv");
      res.send(csv);
    } else if (format === "xml") {
      const toXml = (obj: any): string => {
        let xml = "";
        for (const prop in obj) {
          if (Object.prototype.hasOwnProperty.call(obj, prop)) {
            xml += `<${prop}>`;
            if (typeof obj[prop] === "object" && obj[prop] !== null) {
              xml += toXml(obj[prop]);
            } else {
              xml += obj[prop];
            }
            xml += `</${prop}>`;
          }
        }
        return xml;
      };

      let xmlOutput = '<?xml version="1.0" encoding="UTF-8"?>\n<root>\n';
      if (Array.isArray(data)) {
        data.forEach((item) => {
          xmlOutput += "  <item>\n" + toXml(item).split("\n").map(line => "    " + line).join("\n") + "\n  </item>\n";
        });
      } else {
        xmlOutput += toXml(data);
      }
      xmlOutput += "</root>";

      res.setHeader("Content-Type", "application/xml");
      res.send(xmlOutput);
    } else {
      res.status(400).send("Invalid format");
    }
  } catch (error: any) {
    console.error("Export Handler Error:", error.message);
    res.status(500).send(`Export failed: ${error.message}`);
  }
}
