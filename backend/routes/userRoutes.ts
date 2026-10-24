import  express  from "express";
import protectRoute from "../middleware/protectRoute.ts";
import { getAllUsers } from "../controllers/userController.ts";

const router = express.Router();

router.get('/', protectRoute, getAllUsers)


export default router;
