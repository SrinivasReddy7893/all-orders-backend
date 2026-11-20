import { Router } from "express";
import { getMeController, updateProfileController, deleteUserController, disconnectMailboxController } from "../controllers/user.controller";

const userRouter = Router();

userRouter.get("/me", getMeController);
userRouter.patch("/profile", updateProfileController);
userRouter.delete("/", deleteUserController);
userRouter.delete("/mailboxes/:id", disconnectMailboxController);


export default userRouter;