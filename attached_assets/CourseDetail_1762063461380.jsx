import React, { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { 
  BookOpen, Clock, Users, Star, ArrowLeft, CheckCircle, 
  Play, Award, TrendingUp 
} from "lucide-react";
import FadeInWhenVisible from "../components/FadeInWhenVisible";
import coursesData from "../data/courses.json";

export default function CourseDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [course, setCourse] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Find the course by ID
    const foundCourse = coursesData.find(c => c.id === parseInt(id));
    setCourse(foundCourse);
    setLoading(false);
  }, [id]);

  if (loading) {
    return (
      <div className="bg-gradient-to-b from-blue-50 via-blue-25 to-blue-100 text-slate-800 min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-center">
          <div className="text-4xl mb-4">📚</div>
          <p className="text-xl text-slate-600">Loading course details...</p>
        </div>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="bg-gradient-to-b from-blue-50 via-blue-25 to-blue-100 text-slate-800 min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">🔍</div>
          <h2 className="text-3xl font-bold text-slate-800 mb-4">Course Not Found</h2>
          <p className="text-slate-600 mb-8">The course you're looking for doesn't exist.</p>
          <Link
            to="/courses"
            className="inline-block px-8 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors"
          >
            Browse All Courses
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-b from-blue-50 via-blue-25 to-blue-100 text-slate-800 min-h-screen">
      {/* Hero Section */}
      <section className="pt-24 pb-16 bg-gradient-to-b from-blue-50 via-white to-blue-100">
        <div className="max-w-7xl mx-auto px-6">
          {/* Back Button */}
          <Link
            to="/courses"
            className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 mb-6 transition-colors"
          >
            <ArrowLeft size={20} />
            Back to Courses
          </Link>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
            {/* Main Content */}
            <div className="lg:col-span-2 space-y-8">
              {/* Course Header */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8 }}
                className="space-y-4"
              >
                <div className="flex items-center gap-2">
                  <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium">
                    {course.category}
                  </span>
                  <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
                    {course.gradeLevel}
                  </span>
                </div>
                <h1 className="text-4xl md:text-5xl font-bold text-slate-800 leading-tight">
                  {course.title}
                </h1>
                <p className="text-xl text-slate-600 leading-relaxed">
                  {course.description}
                </p>
              </motion.div>

              {/* Course Stats */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.2 }}
                className="grid grid-cols-2 md:grid-cols-4 gap-4"
              >
                <div className="bg-white rounded-xl p-4 shadow-md">
                  <div className="flex items-center gap-2 text-blue-600 mb-2">
                    <Star className="w-5 h-5 fill-yellow-400 text-yellow-400" />
                  </div>
                  <div className="text-2xl font-bold text-slate-800">{course.rating}</div>
                  <div className="text-sm text-slate-600">Rating</div>
                </div>
                <div className="bg-white rounded-xl p-4 shadow-md">
                  <div className="flex items-center gap-2 text-blue-600 mb-2">
                    <Users className="w-5 h-5" />
                  </div>
                  <div className="text-2xl font-bold text-slate-800">{course.students.toLocaleString()}+</div>
                  <div className="text-sm text-slate-600">Students</div>
                </div>
                <div className="bg-white rounded-xl p-4 shadow-md">
                  <div className="flex items-center gap-2 text-blue-600 mb-2">
                    <Clock className="w-5 h-5" />
                  </div>
                  <div className="text-2xl font-bold text-slate-800">{course.duration}</div>
                  <div className="text-sm text-slate-600">Duration</div>
                </div>
                <div className="bg-white rounded-xl p-4 shadow-md">
                  <div className="flex items-center gap-2 text-blue-600 mb-2">
                    <Award className="w-5 h-5" />
                  </div>
                  <div className="text-2xl font-bold text-slate-800">Certified</div>
                  <div className="text-sm text-slate-600">Certificate</div>
                </div>
              </motion.div>

              {/* Course Image */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.3 }}
                className="rounded-2xl overflow-hidden shadow-xl"
              >
                <img
                  src={course.thumbnail}
                  alt={course.title}
                  className="w-full h-96 object-cover"
                />
              </motion.div>

              {/* Learning Goals */}
              <FadeInWhenVisible>
                <div className="bg-white rounded-2xl p-8 shadow-lg">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                      <TrendingUp className="w-6 h-6 text-blue-600" />
                    </div>
                    <h2 className="text-2xl font-bold text-slate-800">Learning Goals</h2>
                  </div>
                  <p className="text-slate-600 leading-relaxed text-lg">
                    {course.learningGoals}
                  </p>
                </div>
              </FadeInWhenVisible>

              {/* Session Outline */}
              <FadeInWhenVisible delay={0.2}>
                <div className="bg-white rounded-2xl p-8 shadow-lg">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                      <Play className="w-6 h-6 text-blue-600" />
                    </div>
                    <h2 className="text-2xl font-bold text-slate-800">Session Outline</h2>
                  </div>
                  <div className="space-y-3">
                    {course.sessionOutline.map((session, index) => (
                      <motion.div
                        key={index}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.5, delay: index * 0.05 }}
                        className="flex items-start gap-3 p-4 bg-blue-50 rounded-xl hover:bg-blue-100 transition-colors"
                      >
                        <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-semibold text-sm">
                          {index + 1}
                        </div>
                        <p className="text-slate-700">{session}</p>
                      </motion.div>
                    ))}
                  </div>
                </div>
              </FadeInWhenVisible>

              {/* Capstone Project */}
              <FadeInWhenVisible delay={0.4}>
                <div className="bg-gradient-to-br from-blue-600 to-blue-700 text-white rounded-2xl p-8 shadow-lg">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center">
                      <Award className="w-6 h-6" />
                    </div>
                    <h2 className="text-2xl font-bold">Capstone Project</h2>
                  </div>
                  <p className="text-blue-100 leading-relaxed text-lg">
                    {course.capstoneProject}
                  </p>
                </div>
              </FadeInWhenVisible>

              {/* Key Takeaways */}
              <FadeInWhenVisible delay={0.6}>
                <div className="bg-white rounded-2xl p-8 shadow-lg">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                      <CheckCircle className="w-6 h-6 text-green-600" />
                    </div>
                    <h2 className="text-2xl font-bold text-slate-800">Key Takeaways</h2>
                  </div>
                  <p className="text-slate-600 leading-relaxed text-lg">
                    {course.keyTakeaways}
                  </p>
                </div>
              </FadeInWhenVisible>
            </div>

            {/* Sidebar */}
            <div className="lg:col-span-1">
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.8, delay: 0.4 }}
                className="sticky top-24 space-y-6"
              >
                {/* Enroll Card */}
                <div className="bg-white rounded-2xl p-8 shadow-xl border border-blue-200">
                  <div className="text-center mb-6">
                    <div className="text-5xl font-bold text-blue-600 mb-2">
                      {course.price}
                    </div>
                    <div className="text-slate-600">One-time payment</div>
                  </div>

                  <button
                    onClick={() => {
                      alert(`Enrollment for "${course.title}" coming soon!`);
                    }}
                    className="w-full py-4 bg-gradient-to-r from-blue-600 to-blue-700 text-white font-bold rounded-xl hover:from-blue-700 hover:to-blue-800 transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-105 mb-4"
                  >
                    Enroll Now
                  </button>

                  <div className="space-y-3 text-sm">
                    <div className="flex items-center gap-2 text-slate-600">
                      <CheckCircle className="w-5 h-5 text-green-500" />
                      <span>Full lifetime access</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-600">
                      <CheckCircle className="w-5 h-5 text-green-500" />
                      <span>Certificate of completion</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-600">
                      <CheckCircle className="w-5 h-5 text-green-500" />
                      <span>Access on mobile and desktop</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-600">
                      <CheckCircle className="w-5 h-5 text-green-500" />
                      <span>Downloadable resources</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-600">
                      <CheckCircle className="w-5 h-5 text-green-500" />
                      <span>Instructor support</span>
                    </div>
                  </div>
                </div>

                {/* Instructor Info */}
                <div className="bg-white rounded-2xl p-6 shadow-md">
                  <h3 className="font-bold text-lg text-slate-800 mb-4">Instructor</h3>
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
                      <BookOpen className="w-8 h-8 text-blue-600" />
                    </div>
                    <div>
                      <div className="font-semibold text-slate-800">{course.instructor}</div>
                      <div className="text-sm text-slate-600">Expert Instructor</div>
                    </div>
                  </div>
                </div>

                {/* Tech Stack */}
                <div className="bg-white rounded-2xl p-6 shadow-md">
                  <h3 className="font-bold text-lg text-slate-800 mb-4 flex items-center gap-2">
                    <BookOpen className="w-5 h-5 text-blue-600" />
                    Tech Stack
                  </h3>
                  <p className="text-slate-600">{course.techStack}</p>
                </div>
              </motion.div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

