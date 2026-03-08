import { Router } from "express";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import { ObjectStorageService } from "../objectStorage";

const router = Router();
const objectStorageService = new ObjectStorageService();

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

router.post("/", upload.single('file'), async (req, res) => {
    try {
        const file = req.file;
        if (!file) return res.status(400).json({ error: "No file uploaded" });

        const fileExtension = file.originalname.split('.').pop() || 'bin';
        const fileName = `document-${uuidv4()}.${fileExtension}`;
        const storagePath = await objectStorageService.uploadToPrivateDir(fileName, file.buffer, file.mimetype);

        res.json({
            url: storagePath,
            fileName: file.originalname,
            type: file.mimetype,
            size: file.size
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed' });
    }
});

router.post("/profile-image/url", async (req, res) => {
    try {
        const { userId, uploadType, fileExtension } = req.body;
        const fileName = `${uploadType}-${userId}-${uuidv4()}.${fileExtension}`;
        const uploadUrl = await objectStorageService.getPublicObjectUploadURL(fileName);

        res.json({
            uploadUrl,
            fileName,
            publicUrl: `/public-objects/${fileName}`
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed' });
    }
});

export default router;
