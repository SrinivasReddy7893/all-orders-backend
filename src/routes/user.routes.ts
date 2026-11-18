import { Router } from "express";
import { getMeController, updateProfileController, deleteUserController } from "../controllers/user.controller";

const userRouter = Router();

userRouter.get("/me", getMeController);
userRouter.patch("/profile", updateProfileController);
userRouter.delete("/", deleteUserController);


export default userRouter;