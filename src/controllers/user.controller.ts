import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { updateProfileService, deleteUserService } from "../services/user.service";
import { updateProfileSchema } from "../validations/user.validation";

export const getMeController = asyncHandler(
  async (req: Request, res: Response) => {
    const user = req.user;

    if (!user) {
      throw new Error("User not found");
    }

    const responseUser = {
      id: user.id,
      phone: user.phone,
      email: user.email,
      name: user.name,
      avatar: user.avatar,

      isPhoneVerified: user.isPhoneVerified,
      isEmailVerified: user.isEmailVerified,

      createdAt: user.createdAt,
      updatedAt: user.updatedAt,

      // helpful flags
      hasPhone: !!user.phone,
      hasEmail: !!user.email,
      hasName: !!user.name,
      hasAvatar: !!user.avatar,

      isProfileComplete:
        user.isPhoneVerified &&
        user.isEmailVerified &&
        !!user.name,
    };

    res.status(200).json({
      success: true,
      data: {
        user: responseUser,
      },
    });
  }
);

export const updateProfileController = asyncHandler(
  async (req: Request, res: Response) => {
    const parsed = updateProfileSchema.parse(req.body);

    const userId = req.user!.id;

    const updatedUser = await updateProfileService({
      userId,
      ...parsed,
    });

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      data: {
        user: {
          id: updatedUser.id,
          phone: updatedUser.phone,
          email: updatedUser.email,
          name: updatedUser.name,
          avatar: updatedUser.avatar,
          isPhoneVerified: updatedUser.isPhoneVerified,
          isEmailVerified: updatedUser.isEmailVerified,
          updatedAt: updatedUser.updatedAt,
        },
      },
    });
  }
);

export const deleteUserController = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user!.id;

    const result = await deleteUserService(userId);

    res.status(200).json({
      success: true,
      message: result.message,
    });
  }
);