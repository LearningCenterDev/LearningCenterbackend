import { Router } from "express";
import { storage } from "../storage";
import { insertCourseSchema } from "../../shared/schema";

const router = Router();

router.get("/:id", async (req, res) => {
    try {
        const course = await storage.getCourse(req.params.id);
        if (!course) return res.status(404).json({ error: "Course not found" });

        let teacher = null;
        if (course.teacherId) {
            teacher = await storage.getUser(course.teacherId);
        }

        const curriculumUnits = await storage.getCurriculumUnitsByCourse(req.params.id);
        const unitsWithSubsections = await Promise.all(
            curriculumUnits.map(async (unit) => {
                const subsections = await storage.getCurriculumSubsectionsByUnit(unit.id);
                return { ...unit, subsections };
            })
        );

        res.json({ ...course, teacher, curriculumUnits: unitsWithSubsections });
    } catch (error) {
        console.error("Error fetching course by ID:", error);
        res.status(500).json({ error: 'Failed' });
    }
});

router.get("/", async (req, res) => {
    try {
        const active = req.query.active === 'true';
        let courses = await storage.getAllCourses();
        if (active) courses = courses.filter(course => course.isActive);
        res.json(courses);
    } catch (error) {
        console.error("Error fetching all courses:", error);
        res.status(500).json({ error: 'Failed' });
    }
});

router.post("/", async (req, res) => {
    try {
        const validatedData = insertCourseSchema.parse(req.body);
        const course = await storage.createCourse(validatedData);
        res.status(201).json(course);
    } catch (error) {
        console.error("Error creating course:", error);
        res.status(400).json({ error: 'Failed' });
    }
});

export default router;
