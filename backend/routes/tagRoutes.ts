import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { wrap } from "../utils/http.js";
import * as tags from "../controllers/tagController.js";

const router = Router();
router.use(requireAuth);
router.get("/", wrap(tags.list));
router.patch("/:id", wrap(tags.rename));
router.delete("/:id", wrap(tags.remove));
export default router;
