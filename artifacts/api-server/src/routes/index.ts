import { Router, type IRouter } from "express";
import healthRouter from "./health";
import forecastRouter from "./forecast";

const router: IRouter = Router();

router.use(healthRouter);
router.use(forecastRouter);

export default router;
