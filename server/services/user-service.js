import UserModel from '../models/user-model.js';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import mailService from './mail-service.js';
import tokenService from './token-service.js';
import ApiError from '../exceptions/api-error.js';

class UserService {
  async setTokens(user) {
    const userDto = {
      email: user.email,
      id: user._id,
      isActivated: user.isActivated,
    };

    const tokens = tokenService.generateTokens(userDto);

    await tokenService.saveToken(userDto.id, tokens.refreshToken);

    return { ...tokens, user: userDto };
  }

  async registration(email, password) {
    const candidate = await UserModel.findOne({ email });

    if (candidate) throw ApiError.BadRequest(`Пользователь с адресом ${email} уже существует`);

    const hashPassword = await bcrypt.hash(password, 3);
    const activationLink = uuidv4();
    const user = await UserModel.create({ email, password: hashPassword, activationLink });

    await mailService.sendActivationMail(email, `${process.env.API_URL}/api/activate/${activationLink}`);

    return await this.setTokens(user);
  }

  async activate(activationLink) {
    const user = await UserModel.findOne({activationLink});

    if (!user) throw ApiError.BadRequest('Некорректная ссылка активации');

    user.isActivated = true;
    await user.save();
  }

  async login(email, password) {
    const user = await UserModel.findOne({ email });

    if (!user) throw ApiError.BadRequest(`Пользователя с адресом ${email} не существует`);

    const isCorrectPassword = await bcrypt.compare(password, user.password);

    if (!isCorrectPassword) throw ApiError.BadRequest('Неверный пароль');

    return await this.setTokens(user);
  }

  async logout(refreshToken) {
    const token = await tokenService.removeToken(refreshToken);
    return token;
  }

  async refresh(refreshToken) {
    if (!refreshToken) throw ApiError.UnauthorizedError();

    const userData = tokenService.validateRefreshToken(refreshToken);

    const refreshTokenFromDB = await tokenService.findToken(refreshToken);

    if (!userData || !refreshTokenFromDB) throw ApiError.UnauthorizedError();

    const user = await UserModel.findById(userData.id);

    return await this.setTokens(user);
  }

  async getUsers() {
    const users = await UserModel.find();
    return users;
  }
}

export default new UserService();
