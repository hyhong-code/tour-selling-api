const mongoose = require('mongoose');
const slugify = require('slugify');

const TourSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'A name is required for a tour'],
      unique: true,
      trim: true,
    },
    slug: String,
    duration: {
      type: Number,
      required: [true, 'A duration is required for a tour'],
    },
    maxGroupSize: {
      type: Number,
      required: [true, 'A maxGroupSize is required for a tour'],
    },
    difficulty: {
      type: String,
      required: [true, 'A difficulty is required for a tour'],
    },
    ratingsAverage: {
      type: Number,
      default: 4.5,
    },
    ratingsQuantity: {
      type: Number,
      default: 0,
    },
    price: {
      type: Number,
      required: [true, 'A price is required for a tour'],
    },
    priceDiscount: Number,
    summary: {
      type: String,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      required: [true, 'A description is required for a tour'],
    },
    imageCover: {
      type: String,
      required: [true, 'A imageCover is required for a tour'],
    },
    images: [String],
    createdAt: {
      type: Date,
      default: Date.now(),
      select: false,
    },
    startDates: [Date], //2021-03-21,11:32
  },
  {
    // Everytime data is outputted as JSON or Object, include the virtuals
    toJSON: { virtuals: true },
    toObject: { virtual: true },
  }
);

// Virtuals cannot be selected
TourSchema.virtual('durationWeeks').get(function () {
  return this.duration / 7;
});

// Document middleware: runs before .save() and .create()
TourSchema.pre('save', function (next) {
  this.slug = slugify(this.name, { lower: true });
  next();
});

// TourSchema.pre('save', function (next) {
//   console.log('Will save doc');
//   next();
// });

// TourSchema.post('save', function (doc, next) {
//   console.log(doc);
//   next();
// });

const Tour = mongoose.model('Tour', TourSchema);

module.exports = Tour;
