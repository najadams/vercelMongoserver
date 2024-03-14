const mongoose = require("mongoose");

const lecturerSchema = new mongoose.Schema({
  firstname: { type: String, required: true },
  lastname: { type: String, required: true },
  referenceId: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  classes: [{type: mongoose.Schema.Types.ObjectId, ref: "Classes"}],
  lecturerLocation: {
    longitude: { type: Number, required: false },
    latitude: { type: Number, required: false },
  },
});

const Lecturer = mongoose.model("Lecturer", lecturerSchema);

const classSchema = new mongoose.Schema({
  name: { type: String, required: true },
  lecturerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Lecturer",
    required: true,
  },
  students: [{ type: mongoose.Schema.Types.ObjectId, ref: "Student" }],
  attendancePortalStatus: {
    type: String,
    enum: ["open", "closed"],
    default: "closed",
  },
  portalOpenedAt: { type: Date, required: false },
});

const Class = mongoose.model("Class", classSchema);

const studentSchema = new mongoose.Schema({
  firstname: { type: String, required: true },
  lastname: { type: String, required: true },
  studentId: { type: String, required: true, unique: true },
  indexNumber: { type: String, required: false, unique: true },
  classes: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Class",
      required: true,
    },
  ],
});

const Student = mongoose.model("Student", studentSchema);

const attendanceSchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Student",
    required: true,
    index: true,
  },
  classId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Class",
    required: true, 
    index: true,
  },
  stats: [
    {
      date: {
        type: Date,
        default: function () {
          // Get current date without the time component
          const currentDate = new Date();
          return new Date(
            currentDate.getFullYear(),
            currentDate.getMonth(),
            currentDate.getDate()
          );
        },
      },
      status: {
        type: String,
        enum: ["Present", "Absent"],
        required: true,
        default: "Absent",
      },
    },
  ],
});

attendanceSchema.pre("save", function (next) {
  // Iterate over each stat and set the date if not already set
  this.stats.forEach((stat) => {
    if (!stat.date) {
      stat.date = new Date();
    }
  });

  next();
});

const Attendance = mongoose.model("Attendance", attendanceSchema);

module.exports = { Lecturer, Class, Student, Attendance };
