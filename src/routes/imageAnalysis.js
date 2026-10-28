
import { Router } from "express";
import multer from "multer";
import OpenAI from "openai";

const router = Router();


const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Upload a JPG, PNG, or WebP image."));
    }
  },
});

router.post("/image-analysis", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "Please upload an image." });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(503).json({ message: "OpenAI API key is not configured." });
    }
    const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

    const mime = req.file.mimetype;
    const base64 = req.file.buffer.toString("base64");
    const imageUrl = `data:${mime};base64,${base64}`;

    const response = await openai.responses.create({
  timeout: 120000,
      model: "gpt-5.5",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `You are BrandGuard AI, a brand-governance reviewer.
Analyze this marketing image. Read visible promotional text and identify:
1. Potentially unsupported or absolute claims.
2. Brand consistency issues visible in the image.
3. Accessibility issues, including readability and contrast.
4. Specific recommendations to fix each issue.

Do not claim a statement is false merely because the image does not prove it.
Clearly distinguish observed evidence from potential risks.
Return a concise report with headings and bullet points.`,
            },
            {
              type: "input_image",
              image_url: imageUrl,
              detail: "auto",
            },
          ],
        },
      ],
    });

    res.json({
      success: true,
      analysis: response.output_text,
      aiMode: "openai-vision",
    });
  } catch (error) {
    console.error("Image analysis failed:", error.message);
    res.status(500).json({
      message: "Image analysis failed. Check your API configuration and try again.",
    });
  }
});

export default router;
