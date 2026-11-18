import { Router } from "express";
import healthRoutes from "./health.routes";

const router = Router();

router.get('/', (_req, res)=>{
    res.send('Welcome to All Orders App!')
})

router.use('/health', healthRoutes );

export default router;