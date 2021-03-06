const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/userModel');
const AppError = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');
const sendEmail = require('../utils/email');

const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });

const createAndSendToken = (user, statusCode, res) => {
  const token = signToken(user._id);

  const cookieOptions = {
    expires: new Date(
      Date.now() + process.env.JWT_COOKIE_EXPIRES_IN * 24 * 60 * 60 * 1000
    ),
    httpOnly: true, // Receive and send only, no access
    secure: process.env.NODE_ENV === 'production',
  };

  res.cookie('jwt', token, cookieOptions);

  user.password = undefined; // Don't show password to cliend

  res.status(statusCode).json({
    status: 'success',
    token,
    data: { user },
  });
};

exports.signup = catchAsync(async (req, res, next) => {
  const newUser = await User.create({
    name: req.body.name,
    email: req.body.email,
    password: req.body.password,
    passwordConfirm: req.body.passwordConfirm,
  });

  createAndSendToken(newUser, 201, res);
});

exports.login = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return next(new AppError(`Email and password are required`, 400));
  }

  const user = await User.findOne({ email }).select('+password'); // because select:false in model

  if (!user || !(await user.correctPassword(password, user.password))) {
    return next(new AppError(`Invalid credentials`, 401));
  }

  createAndSendToken(user, 200, res);
});

exports.updatePassword = catchAsync(async (req, res, next) => {
  const { currentPassword, newPassword, newPasswordComfirmed } = req.body;
  const user = await User.findById(req.user.id).select('+password');

  // Check password is correct
  if (!(await user.correctPassword(currentPassword, user.password))) {
    return next(new AppError(`Current password is incorrect`, 401));
  }

  // Update password
  user.password = newPassword;
  user.passwordConfirm = newPasswordComfirmed;
  await user.save({ validateBeforeSave: true });

  createAndSendToken(user, 200, res);
});

exports.forgotPassword = catchAsync(async (req, res, next) => {
  const { email } = req.body;
  const user = await User.findOne({ email });

  if (!user) {
    return next(new AppError(`No such user with email ${email}`, 404));
  }
  // Gen random token
  const resetToken = await user.createPasswordResetToken();

  const resetURL = `${req.protocol}://${req.get(
    'host'
  )}/api/v1/users/resetpassword/${resetToken}`;

  const message = `To reset password, please send a PATCH request with your new password and passwordConfirm to ${resetURL} 
  \nIf you didn't forget your password, ignore this email.`;

  try {
    // Send email
    await sendEmail(
      `"Admin" <no-reply@hong.com>`,
      `${email}`,
      `Password reset token, expires in 10mins`,
      message
    );
  } catch (error) {
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save({ validateBeforeSave: false });
    return next(new AppError(`Error sending email, try again later`, 500));
  }

  res.status(200).json({
    status: 'success',
    message: 'Token sent to email',
  });
});

exports.resetPassword = catchAsync(async (req, res, next) => {
  const { token } = req.params;

  // Re-hash token to compare
  const passwordResetToken = crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');

  // Try to get user
  const user = await User.findOne({
    passwordResetToken, // user with the token
    passwordResetExpires: { $gt: Date.now() }, // token not expired
  });

  if (!user) {
    return next(new AppError(`Token is invalid or expired`, 400));
  }

  const { password, passwordConfirm } = req.body;
  //   if (!password || !passwordConfirm) {
  //     return next(new AppError(`Password and passwordConfirm are required`, 400));
  //   }

  // Set new password - validaton handled by mongoose
  user.password = password;
  user.passwordConfirm = passwordConfirm;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  await user.save(); // Use .save to trigger password validation, and bcrypt hash

  createAndSendToken(user, 200, res);
});

exports.protect = catchAsync(async (req, res, next) => {
  // Check if there is a token in request headers
  if (
    !req.headers.authorization ||
    !req.headers.authorization.startsWith('Bearer')
  ) {
    return next(new AppError(`Not logged in, please login to access`, 401));
  }

  const token = req.headers.authorization.split(' ')[1];

  // Invalid token and expired token errors are handled in global error handler
  const decoded = jwt.verify(token, process.env.JWT_SECRET);

  // Check if user still exists
  const user = await User.findById(decoded.id);
  if (!user) {
    return next(new AppError(`User no longer exists`, 401));
  }

  // Check if user recently changed password
  if (user.changedPasswordAfter(decoded.iat)) {
    return next(
      new AppError(`Password is recently changed, please login again`, 401)
    );
  }

  // Give access
  req.user = user;

  next();
});

exports.restrictTo = (...roles) => (req, res, next) => {
  // roles ['admin','lead-guide']
  if (!roles.includes(req.user.role)) {
    return next(
      new AppError(
        `User role ${req.user.role} is unauthorized to access this route`,
        403
      )
    );
  }
  next();
};
