import axios from "axios";
import * as cheerio from "cheerio";
import { GoogleGenAI, Type } from "@google/genai";
import { DOMParser } from "xmldom";
import xpath from "xpath";

export const engines = {
  "fetch-light": async (url: string) => {
    const response = await axios.get(url, { 
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      timeout: 15000
    });
    const $ = cheerio.load(response.data);
    return { html: response.data, title: $("title").text() };
  },
  "cheerio": async (url: string) => {
    const response = await axios.get(url, { 
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' 
      },
      timeout: 15000
    });
    const $ = cheerio.load(response.data);
    const data: any[] = [];
    $("a").each((i, el) => {
      const text = $(el).text().trim();
      const href = $(el).attr("href");
      if (text || href) data.push({ text, href });
    });
    return { data, count: data.length };
  },
  "gemini-ai": async (url: string, instruction: string) => {
    const response = await axios.get(url, { 
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' 
      },
      timeout: 20000
    });
    const html = response.data.substring(0, 40000); 
    
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
    const model = ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Extract data from this HTML based on these instructions: ${instruction}\n\nHTML:\n${html}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            data: {
              type: Type.ARRAY,
              items: { type: Type.OBJECT, properties: { label: { type: Type.STRING }, value: { type: Type.STRING } } }
            }
          }
        }
      }
    });
    const result = await model;
    return JSON.parse(result.text || "{}");
  },
  "playwright": async (url: string) => {
    const apiKey = process.env.BROWSERLESS_API_KEY;
    if (!apiKey) throw new Error("BROWSERLESS_API_KEY not configured");
    
    const response = await axios.post(`https://chrome.browserless.io/content?token=${apiKey}`, {
      url,
      elements: [
        { selector: "title" },
        { selector: "h1" },
        { selector: ".price" },
        { selector: "#price" }
      ]
    });
    return response.data;
  },
  "importxml": async (url: string, query: string) => {
    const response = await axios.get(url);
    const doc = new DOMParser().parseFromString(response.data);
    const nodes = xpath.select(query, doc);
    if (Array.isArray(nodes)) {
      return nodes.map((n: any) => n.toString());
    }
    return [nodes.toString()];
  }
};
