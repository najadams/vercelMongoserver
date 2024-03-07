require("dotenv").config();
const QRCode = require("qrcode");
const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const cors = require("cors");
const bodyParser = require("body-parser");
const WebSocket = require("ws");
const http = require("http");
// Example usage in another file
const { Lecturer, Class, Student, Attendance } = require("./Models");

// Now you can use Lecturer, Class, Student, and Attendance in this file.
const app = express();
const server = http.createServer(app);
const wsServer = new WebSocket.Server({ noServer: true });
const PORT = process.env.PORT || 3000;

// "mongodb://127.0.0.1:27017/test"
mongoose
.connect(process.env.URI ||
  "mongodb+srv://najadams:90m8qgUYSID8YXP4@cluster0.xexrmso.mongodb.net/?retryWrites=true&w=majority"
  )
.then(() => console.log("Successfully connected to MongoDB"))
  .catch((err) => console.error("Failed to connect to MongoDB:", err));

const db = mongoose.connection;
db.on("error", console.error.bind(console, "MongoDB connection error:"));
db.once("open", () => console.log("Connected to MongoDB"));

app.use(express.static("public"));
app.use(cors());
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));

server.on("upgrade", (request, socket, head) => {
  wsServer.handleUpgrade(request, socket, head, (socket) => {
    wsServer.emit("connection", socket, request);
  });
});

wsServer.on("connection", (socket, req) => {
  console.log("WebSocket connection established");
  socket.on("close", () => {
    console.log("WebSocket connection closed");
  });
});

// Check for successful connection
app.get("/", (req, res) => {
  try {
    res.sendFile(__dirname + "/public/index.html");
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to load index.html" });
  }
});

app.get("/lecturers", async (req, res) => {
  try {
    // Find all lecturers in the database
    const lecturers = await Lecturer.find();

    // Send the list of lecturers as JSON response
    res.status(200).json({ lecturers });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// Register a Lecturer
app.post("/register/lecturer", async (req, res) => {
  try {
    const { firstname, lastname, referenceId, password } = req.body;
    const existingUser = await Lecturer.findOne({ referenceId });

    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // Create the lecturer
    const createdLecturer = await Lecturer.create({
      firstname,
      lastname,
      referenceId,
      password: hashedPassword,
    });

    // Create a new class associated with the lecturer
    // const newClass = await Class.create({
    //   name: `${firstname}_${referenceId}_Class`,
    //   lecturerId: createdLecturer._id,
    //   students: [], // Initialize with an empty array for students
    //   attendance: [], // Initialize with an empty array for attendance
    // });

    res.status(201).json({ message: "User registered successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// Login url for lectures
app.post("/login/lecturer", async (req, res) => {
  try {
    const { referenceId, password } = req.body;

    // Find the user by email
    const user = await Lecturer.findOne({ referenceId });

    // Check if the user exists
    if (!user) {
      return res.status(401).json({ message: "User doesn't exist" });
    }

    // Compare the provided password with the hashed password in the database
    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Generate a JWT token
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: "1h",
    });

    res.status(200).json({ token, user });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// Login url for students
app.post("/login/student", async (req, res) => {
  try {
    const { firstname, lastname, studentId } = req.body;

    // Find the user by studentId
    const user = await Student.findOne({ studentId });

    // Check if the user exists
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Check if the provided firstname and lastname match
    if (!(firstname === user.firstname && lastname === user.lastname)) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Generate a JWT token
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: "1h",
    });

    res.status(200).json({ token, user });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// create the class collection and associate the students
app.post("/createMongoCollection", async (req, res) => {
  try {
    const { ClassName, headers, rows, lecturerId } = req.body;

    // Create the class
    const newClass = await Class.create({
      name: ClassName,
      lecturerId: lecturerId,
      students: [], // Initialize the students field as an empty array
    });

    // Iterate through the rows and create/update students
    for (const row of rows) {
      // Check if the student with studentId already exists
      const existingStudent = await Student.findOne({
        studentId: row.studentId,
      });

      if (existingStudent) {
        // If the student exists, update the classes field
        await Student.findByIdAndUpdate(
          existingStudent._id,
          { $addToSet: { classes: newClass._id } }, // Use $addToSet to avoid duplicates
          { new: true }
        );

        // Add the student reference to the class's students array
        newClass.students.push(existingStudent._id);
      } else {
        // If the student doesn't exist, create a new student
        const createdStudent = await Student.create({
          firstname: row.firstname,
          lastname: row.lastname,
          studentId: row.studentId,
          indexNumber: row.indexNumber,
          classes: [newClass._id], // Store the classId in the student's classes array
        });

        // Add the created student reference to the class's students array
        newClass.students.push(createdStudent._id);
      }
    }

    // Save the class with the updated students
    await newClass.save();

    res.status(200).json({
      message: "MongoDB collection created and data inserted successfully",
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// find all classes manageed by lecturer
app.post("/lecturer/classes", async (req, res) => {
  try {
    const lecturerId = req.body.lecturerId;
    const data = await Class.find({ lecturerId }).populate("students");

    res.status(200).json({ data });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// endpoint to get the name students in a given class for the lecturer
app.get("/class/:classId", async (req, res) => {
  try {
    const classId = req.params.classId;
    const classDetails = await Class.findById(classId).populate("students");

    if (!classDetails) {
      return res.status(404).json({ message: "Class not found" });
    }

    res.status(200).json({ data: classDetails });
  } catch (error) {
    console.error("Error fetching class details:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// endpoint to get all the classes of a student
app.get("/student/:studentId/classes", async (req, res) => {
  try {
    const student = await Student.findOne({
      studentId: req.params.studentId,
    }).populate("classes");

    if (!student) {
      return res.status(404).json({ error: "Student not found" });
    }

    const classNames = student.classes.map((classObj) => {
      return {
        _id: classObj._id,
        name: classObj.name,
      };
    });
    res.json({ classNames });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// endpoint to get the name of the class
app.get("/class/name/:classid", async (req, res) => {
  try {
    const classId = req.params.classid;
    const className = await Class.findById(classId).select("name");

    if (!className) {
      return res.status(404).json({ message: "Class name not available" });
    }

    res.status(200).json({ class: className });
  } catch (error) {
    console.error("Error fetching class name");
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// Endpoint to open the attendance portal for a specific class
app.post("/api/classes/:classId/open-portal", async (req, res) => {
  try {
    const classId = req.params.classId;

    // Find the class by ID
    const targetClass = await Class.findById(classId);

    if (!targetClass) {
      return res.status(404).json({ error: "Class not found" });
    }

    // Check if the lecturer making the request is the owner of the class
    if (targetClass.lecturerId.toString() !== req.body.lecturerId) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    // Set time the portal was opened and Update the attendance portal status to 'open'
    targetClass.portalOpenedAt = new Date();
    targetClass.attendancePortalStatus = "open";
    await targetClass.save();

    res.status(200).json({ message: "Portal closed successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Endpoint to close the attendance portal for a specific class
app.post("/api/classes/:classId/close-portal", async (req, res) => {
  try {
    const classId = req.params.classId;

    // Find the class by ID
    const targetClass = await Class.findById(classId);

    if (!targetClass) {
      return res.status(404).json({ error: "Class not found" });
    }

    // Check if the lecturer making the request is the owner of the class
    if (targetClass.lecturerId.toString() !== req.body.lecturerId) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    // Update the attendance portal status to 'open'
    targetClass.attendancePortalStatus = "closed";
    await targetClass.save();

    res.json({ message: "Attendance portal closed successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Endpoint to get the state of the attendance portal for a specific class
app.get("/api/classes/:classId/portal-status", async (req, res) => {
  try {
    const classId = req.params.classId;

    // Find the class by ID
    const targetClass = await Class.findById(classId);

    if (!targetClass) {
      return res.status(404).json({ error: "Class not found" });
    }

    // code to close the portal when it's past 10 min since it's been opened
    const tenMinutesInMilliseconds = 10 * 60 * 1000;
    if (
      targetClass.attendancePortalStatus === "open" &&
      new Date() - targetClass.portalOpenedAt > tenMinutesInMilliseconds
    ) {
      targetClass.attendancePortalStatus = "closed";
      await targetClass.save();
    }
    // Return the attendance portal status
    res.json({ portalStatus: targetClass.attendancePortalStatus });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// endpoint to see if student has already marked for the day
app.post("/api/classes/:classId/check", async (req, res) => {
  try {
    const studentId = req.body.studentId; // Use req.query to get parameters from the URL
    const classId = req.params.classId;

    const attendance = await Attendance.findOne({
      studentId: studentId,
      classId: classId,
    });

    if (!attendance) {
      return res.status(404).json({ attendanceMarked: false });
    }

    if (attendance.stats.length > 0) {
      const lastElem = attendance.stats.length - 1;
      const currentDate = new Date();

      // Compare the date parts only
      const markedDate =
        currentDate.getDate() === attendance.stats[lastElem].date.getDate() &&
        currentDate.getMonth() === attendance.stats[lastElem].date.getMonth() &&
        currentDate.getFullYear() ===
          attendance.stats[lastElem].date.getFullYear();

      if (markedDate) {
        return res.json({ attendanceMarked: true });
      } else {
        return res.json({ attendanceMarked: false });
      }
    } else {
      return res.json({ attendanceMarked: false });
    }
  } catch (error) {
    console.error("Error checking attendance:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.post("/mark", async (req, res) => {
  try {
    const { studentId, classId, status } = req.body;

    // Validate the request data
    if (!studentId || !classId || !status) {
      return res.status(400).json({ error: "Incomplete data" });
    }

    // Check if the student exists
    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({ error: "Student not found" });
    }

    // Check if the class exists
    const attendanceClass = await Class.findById(classId);
    if (!attendanceClass) {
      return res.status(404).json({ error: "Class not found" });
    }

    // Check if the attendance portal is closed
    if (attendanceClass.attendancePortalStatus === "closed") {
      return res.status(400).json({ error: "Attendance portal is closed" });
    }

    // Find or create attendance record for the specific student and class combination
    let attendanceRecord = await Attendance.findOne({
      studentId: studentId,
      classId: classId,
    });

    if (!attendanceRecord) {
      // If no existing attendance record, create a new one
      attendanceRecord = new Attendance({
        studentId: studentId,
        classId: classId,
        stats: [],
      });
    }

    // Add new attendance entry to the stats field
    attendanceRecord.stats.push({ status: status });

    // Save the attendance record
    await attendanceRecord.save();

    // Update student's missedDates if the status is "absent"
    if (status === "Absent") {
      await Student.findByIdAndUpdate(studentId, {
        $push: { missedDates: new Date() },
      });
    }

    res
      .status(200)
      .json({ message: "Attendance marked successfully", attendanceRecord });
  } catch (error) {
    console.error("Error marking attendance:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// broadcast lecturer location using websocket
// app.post("/lecturer/location", async (req, res) => {
//   try {
//     const { longitude, latitude } = req.body;
//     const locationData = { longitude, latitude };
//     wsServer.clients.forEach((client) => {
//       if (client.readyState === WebSocket.OPEN) {
//         client.send(JSON.stringify(locationData));
//       }
//     });
//     res.status(200).json({ message: "Location data sent successfully" });
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ error: "Internal Server Error" });
//   }
// });

// get and set lecturers new location coords
app.post("/lecturer/location", async (req, res) => {
  try {
    const { referenceId, longitude, latitude } = req.body;
    const lecturer = await Lecturer.findOne({ referenceId });

    if (!lecturer) {
      return res.status(404).json({ error: "Lecturer not found" });
    }

    lecturer.lecturerLocation = { longitude, latitude };
    await lecturer.save();

    res.status(200).json({ message: "Lecturer location updated" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.get("/lecturer/location/:classId", async (req, res) => {
  try {
    const classId = req.params.classId; // Use params to get the classId from the route
    const classData = await Class.findOne({ _id: classId });

    if (!classData) {
      return res.status(404).json({ error: "Class not found" });
    }

    const lecturerId = classData.lecturerId;
    const ObjectId = mongoose.Types.ObjectId;
    const lecturer = await Lecturer.findById(new ObjectId(lecturerId)); // Use 'new' keyword here

    if (!lecturer) {
      return res.status(404).json({ error: "Lecturer not found" });
    }

    if (
      lecturer.lecturerLocation &&
      lecturer.lecturerLocation.longitude &&
      lecturer.lecturerLocation.latitude
    ) {
      res.status(200).json({ location: lecturer.lecturerLocation });
    } else {
      res.status(404).json({ message: "Location not found for the lecturer" });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// endpoint to get students who have marked their attendance
app.get("/attendance/:classId/:date", async (req, res) => {
  const { classId, date } = req.params;

  try {
    // Convert the date string to a Date object
    const attendanceDate = new Date(date);

    // Find all attendance records for the given class and date
    const attendances = await Attendance.find({
      classId: new mongoose.Types.ObjectId(classId),
      "stats.date": {
        $gte: new Date(attendanceDate.setHours(0, 0, 0)),
        $lt: new Date(attendanceDate.setHours(23, 59, 59)),
      },
    });

    // Extract studentIds from the attendance records
    const studentIds = attendances.map((a) => a.studentId);

    // find all students in the list
    const students = await Student.find({
      _id: { $in: studentIds },
    });

    //  extract their first name and last name
    const studentNames = students.map((s) => {
      const fullname = `${s.firstname} ${s.lastname}`
      return {
        _id: s.studentId,
        name: fullname,
        status : 'Present'
      };
      
    });

    res.json(studentNames);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

server.listen(PORT, () =>
  console.log(`Server is running on http://localhost:${PORT}`)
);
