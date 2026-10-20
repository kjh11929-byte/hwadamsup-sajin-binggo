import { Router, type IRouter } from "express";
import adminRouter from "./admin";
import bingoRouter from "./bingo";
import healthRouter from "./health";

const router: IRouter = Router();

router.use(healthRouter);
router.use(bingoRouter);
router.use(adminRouter);

export default router;
