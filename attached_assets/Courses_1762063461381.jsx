import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useSearchParams, Link } from "react-router-dom";
import { Search, Filter, BookOpen, Users, Clock, Star } from "lucide-react";
import FadeInWhenVisible from "../components/FadeInWhenVisible";
import coursesData from "../data/courses.json";

export default function Courses() {
  const [searchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedGrade, setSelectedGrade] = useState("all");
  const [selectedCategory, setSelectedCategory] = useState("all");

  // Read search query from URL params
  useEffect(() => {
    const searchFromUrl = searchParams.get('search');
    if (searchFromUrl) {
      setSearchQuery(searchFromUrl);
    }
  }, [searchParams]);

  // Use course data from JSON file
  const courses = coursesData;

  const categories = ["all", "Programming", "AI/ML", "Data Science", "Mathematics", "Productivity", "Database", "Data Analysis"];
  const gradeLevels = ["all", "Grades 4-8", "Grades 8-12", "Grades 9-12", "Grades 11-College", "High School-College"];

  const filteredCourses = courses.filter((course) => {
    const matchesSearch = course.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         course.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         course.instructor.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesGrade = selectedGrade === "all" || course.gradeLevel === selectedGrade;
    const matchesCategory = selectedCategory === "all" || course.category === selectedCategory;
    
    return matchesSearch && matchesGrade && matchesCategory;
  });

  return (
    <div className="bg-gradient-to-b from-blue-50 via-blue-25 to-blue-100 text-slate-800 min-h-screen">
      {/* Header Section */}
      <section className="py-20 bg-gradient-to-b from-blue-50 via-white to-blue-100">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-12">
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
              className="text-4xl md:text-6xl font-bold leading-tight text-slate-800 mb-6"
            >
              Explore Our <span className="bg-gradient-to-r from-blue-600 via-blue-700 to-blue-800 bg-clip-text text-transparent">Courses</span>
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1 }}
              className="text-lg md:text-xl text-slate-600 max-w-3xl mx-auto"
            >
              Discover comprehensive learning paths designed for students of all ages. From coding foundations to advanced AI, we have the perfect course for your journey.
            </motion.p>
          </div>

          {/* Search and Filter Section */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1.2 }}
            className="bg-white rounded-2xl p-8 shadow-lg border border-blue-200 mb-12"
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Search Bar */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                <input
                  type="text"
                  placeholder="Search courses..."
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              {/* Grade Level Filter */}
              <div className="relative">
                <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                <select
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none bg-white"
                  value={selectedGrade}
                  onChange={(e) => setSelectedGrade(e.target.value)}
                >
                  {gradeLevels.map((grade) => (
                    <option key={grade} value={grade}>
                      {grade === "all" ? "All Grade Levels" : grade}
                    </option>
                  ))}
                </select>
              </div>

              {/* Category Filter */}
              <div className="relative">
                <BookOpen className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                <select
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none bg-white"
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                >
                  {categories.map((category) => (
                    <option key={category} value={category}>
                      {category === "all" ? "All Categories" : category}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Courses Grid */}
      <section className="py-20 bg-gradient-to-b from-blue-100 via-blue-50 to-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="mb-8">
            <h2 className="text-3xl font-bold text-slate-800 mb-2">
              {filteredCourses.length} Course{filteredCourses.length !== 1 ? 's' : ''} Found
            </h2>
            <p className="text-slate-600">
              {searchQuery || selectedGrade !== "all" || selectedCategory !== "all" 
                ? "Filtered results based on your criteria" 
                : "Browse all available courses"}
            </p>
          </div>

          {filteredCourses.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">🔍</div>
              <h3 className="text-2xl font-bold text-slate-800 mb-2">No courses found</h3>
              <p className="text-slate-600">Try adjusting your search criteria or filters</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {filteredCourses.map((course, index) => (
                <FadeInWhenVisible key={course.id} delay={index * 0.1}>
                  <motion.div
                    whileHover={{ y: -8, scale: 1.02 }}
                    transition={{ type: 'spring', stiffness: 260, damping: 22 }}
                    className="bg-white rounded-2xl shadow-lg border border-blue-200 overflow-hidden hover:shadow-xl transition-all duration-300 h-full flex flex-col"
                  >
                    {/* Course Image */}
                    <div className="h-48 bg-gradient-to-br from-blue-100 to-blue-200 relative overflow-hidden">
                      <img 
                        src={course.thumbnail} 
                        alt={course.title}
                        loading="lazy"
                        className="w-full h-full object-cover absolute inset-0"
                      />
                      <div className="absolute inset-0 bg-gradient-to-br from-blue-500/20 to-blue-700/20"></div>
                      <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-sm px-3 py-1 rounded-full">
                        <span className="text-sm font-semibold text-blue-700">{course.category}</span>
                      </div>
                      <div className="absolute bottom-4 left-4 text-white">
                        <div className="flex items-center gap-2 mb-1">
                          <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                          <span className="text-sm font-semibold">{course.rating}</span>
                        </div>
                        <div className="flex items-center gap-1 text-sm">
                          <Users className="w-4 h-4" />
                          <span>{course.students.toLocaleString()}</span>
                        </div>
                      </div>
                    </div>

                    {/* Course Content */}
                    <div className="p-6 flex flex-col flex-grow">
                      <div className="flex-grow">
                        <h3 className="text-xl font-bold text-slate-800 mb-2 line-clamp-2">
                          {course.title}
                        </h3>
                        <p className="text-sm text-slate-600 line-clamp-3 mb-4">
                          {course.description}
                        </p>

                      {/* Course Details */}
                      <div className="space-y-2 mb-4">
                        <div className="flex items-center gap-2 text-sm text-slate-600">
                          <span className="font-medium">Grade Level:</span>
                          <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs font-medium">
                            {course.gradeLevel}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-slate-600">
                          <Clock className="w-4 h-4" />
                          <span>{course.duration}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-slate-600">
                          <BookOpen className="w-4 h-4" />
                          <span className="truncate">{course.techStack}</span>
                        </div>
                      </div>
                        </div>

                      {/* Enroll Button */}
                      <div className="pt-4 border-t border-gray-100">
                        <Link
                          to={`/course/${course.id}`}
                          className="w-full block text-center px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all duration-200 hover:scale-105 hover:text-white"
                        >
                          Enroll Now
                        </Link>
                      </div>
                    </div>
                  </motion.div>
                </FadeInWhenVisible>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Call to Action */}
      <section className="py-20 bg-gradient-to-b from-white via-blue-50 to-blue-100">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="bg-white border-4 border-blue-500 text-blue-700 rounded-3xl p-12 shadow-2xl relative overflow-hidden backdrop-blur-md"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-blue-100/40 via-transparent to-blue-200/30 rounded-3xl"></div>
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-300/30 rounded-full -translate-y-16 translate-x-16"></div>
            <div className="absolute bottom-0 left-0 w-24 h-24 bg-blue-400/30 rounded-full translate-y-12 -translate-x-12"></div>
            
            <div className="relative z-10">
              <h3 className="text-4xl font-bold mb-4 text-blue-800">
                Ready to Start Learning?
              </h3>
              <p className="mt-4 text-blue-600 text-lg mb-8">
                Join thousands of students who are already advancing their skills with our comprehensive courses.
              </p>
              <a
                href="#signup"
                className="inline-block px-10 py-4 bg-gradient-to-r from-blue-600 to-blue-700 text-white font-bold rounded-xl shadow-lg hover:shadow-xl hover:scale-105 hover:text-white transition-all duration-300 hover:from-blue-700 hover:to-blue-800"
              >
                Get Started Today
              </a>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
