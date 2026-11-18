import prisma from "../config/prisma";
import { AppError } from "../utils/AppError";
import type { Prisma } from "../../generated/prisma/client";

interface UpdateProfileInput {
  userId: string;
  name?: string;
  email?: string;
  phone?: string;
  avatar?: string;
}

export const updateProfileService = async ({
  userId,
  name,
  email,
  phone,
  avatar,
}: UpdateProfileInput) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new AppError("User not found", 404, "USER_NOT_FOUND");
  }

  const dataToUpdate: Prisma.UserUpdateInput = {};

  // ✅ name & avatar (safe to update anytime)
  if (name) dataToUpdate.name = name;
  if (avatar) dataToUpdate.avatar = avatar;

  // 📧 email logic
  if (email) {
    if (user.email && user.email !== email) {
      throw new AppError("Email already set", 400, "EMAIL_EXISTS");
    }

    const existingEmail = await prisma.user.findUnique({
      where: { email },
    });

    if (existingEmail && existingEmail.id !== userId) {
    throw new AppError(
        "Email already linked to another account. Please login with Google or link accounts.",
        409,
        "ACCOUNT_CONFLICT"
    );
    }

    dataToUpdate.email = email;
    dataToUpdate.isEmailVerified = false; // will verify later
  }

  // 📱 phone logic
  if (phone) {
    if (user.phone && user.phone !== phone) {
      throw new AppError("Phone already set", 400, "PHONE_EXISTS");
    }

    const existingPhone = await prisma.user.findUnique({
      where: { phone },
    });

    if (existingPhone && existingPhone.id !== userId) {
      throw new AppError("Phone already in use", 400, "PHONE_TAKEN");
    }

    dataToUpdate.phone = phone;
    dataToUpdate.isPhoneVerified = false; // will verify later
  }

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: dataToUpdate,
  });

  return updatedUser;
};

export const deleteUserService = async (userId: string) => {
  // Sessions, orders (with their timelines), the Gmail connection and the
  // phone-message log are deleted with the user (onDelete: Cascade).
  const { count } = await prisma.user.deleteMany({ where: { id: userId } });
  if (count === 0) {
    throw new AppError("User not found", 404, "USER_NOT_FOUND");
  }

  return {
    message: "User deleted successfully",
  };
};