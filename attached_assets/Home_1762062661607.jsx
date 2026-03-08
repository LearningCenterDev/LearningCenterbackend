import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import { Search, BookOpen, Users, Award, TrendingUp } from "lucide-react";
import FadeInWhenVisible from "../components/FadeInWhenVisible";
import coursesData from "../data/courses.json";

export default function Home() {
  const [searchQuery, setSearchQuery] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const navigate = useNavigate();

  // Simulate checking authentication status
  useEffect(() => {
    // In a real app, this would check localStorage, cookies, or make an API call
    const checkAuthStatus = async () => {
      try {
        // Simulate API call delay
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Check if user is logged in (in real app, this would be from your auth context/API)
        const token = localStorage.getItem('authToken');
        if (token) {
          setIsAuthenticated(true);
          // In real app, fetch user data from your backend
          setUserData({
            name: "John Doe",
            activeCourses: 12,
            progress: 85,
            currentCourse: "Python Basics",
            currentProgress: 75,
            recentActivity: [
              { type: "completed", course: "JavaScript Fundamentals" },
              { type: "started", course: "React Development" },
              { type: "scheduled", course: "Data Structures & Algorithms" }
            ]
          });
        }
      } catch (error) {
        console.error('Error checking auth status:', error);
      } finally {
        setLoading(false);
      }
    };

    checkAuthStatus();
  }, []);

  // Auto-scroll testimonials
  useEffect(() => {
    const testimonials = [
      { name: "Sarah M.", avatar: "/avatars/sarah.jpg", text: "LearnOne helped me ace my SATs with personalized sessions. Highly recommend!" },
      { name: "David R.", avatar: "/avatars/david.jpg", text: "The tutors are excellent — they really know how to make tough topics simple." },
      { name: "Priya K.", avatar: "/avatars/priya.jpg", text: "Affordable, convenient, and interactive! My go-to for live learning." },
      { name: "James W.", avatar: "/avatars/james.jpg", text: "The best investment I've made in my education. Quality is outstanding!" },
      { name: "Maria G.", avatar: "/avatars/maria.jpg", text: "Flexible schedule and amazing tutors. Learning has never been this enjoyable!" },
      { name: "Alex T.", avatar: "/avatars/alex.jpg", text: "Perfect platform for students who want to excel. Highly satisfied!" }
    ];

    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % (testimonials.length - 2));
    }, 4000);

    return () => clearInterval(interval);
  }, []);

  // Get first 5 courses for popular section
  const courses = coursesData.slice(0, 5);

  const filteredCourses = courses.filter((course) =>
    course.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
     <div className="bg-gradient-to-b from-blue-50 via-blue-25 to-blue-100 text-slate-800 min-h-screen">
      {/* ---------------- HERO SECTION ---------------- */}
      <section className="py-20 bg-gradient-to-b from-blue-50 via-white to-blue-100">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            {/* Left Side - CTA and Search */}
            <div className="space-y-8">
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.8 }}
                className="space-y-6"
              >
                <h1 className="text-4xl md:text-6xl font-bold leading-tight text-slate-800">
                  Empower Your Future with{" "}
                  <span className="bg-gradient-to-r from-blue-600 via-blue-700 to-blue-800 bg-clip-text text-transparent">
                    LearnOne
                  </span>
                </h1>
                <p className="text-lg md:text-xl text-slate-600 max-w-2xl">
                  Learn From Experts and Grow Your Skills — All in one place.
                </p>
              </motion.div>

              {/* Search Bar */}
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 1, delay: 0.2 }}
                className="flex bg-white rounded-full shadow-lg overflow-hidden max-w-md"
              >
                <div className="flex items-center px-4 bg-white text-gray-500">
                  <Search size={20} />
                </div>
                <input
                  type="text"
                  placeholder="Search courses..."
                  className="flex-1 px-4 py-4 text-gray-700 outline-none bg-white focus:ring-2 focus:ring-blue-300"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (searchQuery.trim()) {
                        navigate(`/courses?search=${encodeURIComponent(searchQuery)}`);
                      } else {
                        navigate('/courses');
                      }
                    }
                  }}
                />
                <button 
                  onClick={(e) => {
                    e.preventDefault();
                    // Navigate to courses page with search query
                    if (searchQuery.trim()) {
                      navigate(`/courses?search=${encodeURIComponent(searchQuery)}`);
                    } else {
                      navigate('/courses');
                    }
                  }}
                  className="px-6 py-4 bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold hover:from-blue-700 hover:to-blue-800 transition-all duration-200"
                >
                  Search
                </button>
              </motion.div>

              {/* CTA Buttons */}
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 1, delay: 0.4 }}
                className="flex flex-col sm:flex-row gap-4"
              >
                <Link
                  to="/login"
                  className="px-12 py-6 bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold rounded-lg shadow-lg hover:from-blue-700 hover:to-blue-800 transition-all duration-200 hover:shadow-xl hover:scale-105 text-center text-xl"
                >
                  Get Started Free
                </Link>
                <Link
                  to="/courses"
                  className="px-12 py-6 border-2 border-blue-600 text-blue-600 font-semibold rounded-lg hover:bg-blue-600 hover:text-white transition-all duration-200 text-center text-xl"
                >
                  Browse Courses
                </Link>
              </motion.div>
            </div>

            {/* Right Side - Conditional Content */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 1, delay: 0.3 }}
              className="relative"
            >
              {loading ? (
                // Loading state
                <div className="bg-gradient-to-br from-blue-100 to-blue-200 rounded-2xl p-8 shadow-2xl">
                  <div className="bg-white rounded-xl p-6 shadow-lg">
                    <div className="animate-pulse space-y-4">
                      <div className="h-6 bg-gray-200 rounded w-3/4"></div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="h-16 bg-gray-200 rounded"></div>
                        <div className="h-16 bg-gray-200 rounded"></div>
                      </div>
                      <div className="h-4 bg-gray-200 rounded"></div>
                      <div className="h-2 bg-gray-200 rounded"></div>
                    </div>
                  </div>
                </div>
              ) : isAuthenticated && userData ? (
                // Authenticated user dashboard
                <div className="bg-gradient-to-br from-blue-100 to-blue-200 rounded-2xl p-8 shadow-2xl">
                  <div className="bg-white rounded-xl p-6 shadow-lg">
                    <div className="space-y-4">
                      {/* Dashboard Header */}
                      <div className="flex items-center justify-between border-b pb-4">
                        <h3 className="text-xl font-semibold text-slate-800">Welcome back, {userData.name}!</h3>
                        <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                      </div>
                      
                      {/* Dashboard Content */}
                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-blue-50 rounded-lg p-4">
                          <div className="text-2xl font-bold text-blue-600">{userData.activeCourses}</div>
                          <div className="text-sm text-slate-600">Active Courses</div>
                        </div>
                        <div className="bg-green-50 rounded-lg p-4">
                          <div className="text-2xl font-bold text-green-600">{userData.progress}%</div>
                          <div className="text-sm text-slate-600">Overall Progress</div>
                        </div>
                      </div>
                      
                      {/* Progress Bar */}
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-600">{userData.currentCourse}</span>
                          <span className="text-slate-600">{userData.currentProgress}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-blue-600 h-2 rounded-full transition-all duration-500" 
                            style={{width: `${userData.currentProgress}%`}}
                          ></div>
                        </div>
                      </div>
                      
                      {/* Recent Activity */}
                      <div className="space-y-2">
                        <h4 className="font-medium text-slate-800">Recent Activity</h4>
                        <div className="space-y-1 text-sm text-slate-600">
                          {userData.recentActivity.map((activity, index) => (
                            <div key={index}>
                              {activity.type === 'completed' && '✓ Completed: '}
                              {activity.type === 'started' && '→ Started: '}
                              {activity.type === 'scheduled' && '📅 Next: '}
                              {activity.course}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                // Non-authenticated user - platform preview
                <div className="bg-gradient-to-br from-blue-100 to-blue-200 rounded-2xl p-8 shadow-2xl">
                  <div className="bg-white rounded-xl p-6 shadow-lg">
                    <div className="space-y-6">
                      {/* Platform Features Preview */}
                      <div className="text-center">
                        <h3 className="text-2xl font-bold text-slate-800 mb-2">What You'll Get</h3>
                        <p className="text-slate-600">Join thousands of learners already on their journey</p>
                      </div>
                      
                      {/* Feature Icons */}
                      <div className="grid grid-cols-2 gap-6">
                        <div className="text-center">
                          <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-2">
                            <BookOpen className="w-6 h-6 text-blue-600" />
                          </div>
                          <div className="text-sm font-medium text-slate-800">Expert Courses</div>
                          <div className="text-xs text-slate-600">Learn from industry professionals</div>
                        </div>
                        <div className="text-center">
                          <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-2">
                            <Users className="w-6 h-6 text-green-600" />
                          </div>
                          <div className="text-sm font-medium text-slate-800">Live Tutoring</div>
                          <div className="text-xs text-slate-600">1-on-1 sessions with tutors</div>
                        </div>
                        <div className="text-center">
                          <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-2">
                            <Award className="w-6 h-6 text-purple-600" />
                          </div>
                          <div className="text-sm font-medium text-slate-800">Certificates</div>
                          <div className="text-xs text-slate-600">Earn recognized credentials</div>
                        </div>
                        <div className="text-center">
                          <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-2">
                            <TrendingUp className="w-6 h-6 text-orange-600" />
                          </div>
                          <div className="text-sm font-medium text-slate-800">Track Progress</div>
                          <div className="text-xs text-slate-600">Monitor your learning journey</div>
                        </div>
                      </div>
                      
                      {/* Stats Preview */}
                      <div className="bg-slate-50 rounded-lg p-4">
                        <div className="grid grid-cols-3 gap-4 text-center">
                          <div>
                            <div className="text-lg font-bold text-slate-800">10K+</div>
                            <div className="text-xs text-slate-600">Students</div>
                          </div>
                          <div>
                            <div className="text-lg font-bold text-slate-800">500+</div>
                            <div className="text-xs text-slate-600">Courses</div>
                          </div>
                          <div>
                            <div className="text-lg font-bold text-slate-800">4.9★</div>
                            <div className="text-xs text-slate-600">Rating</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        </div>
      </section>

       {/* ---------------- FEATURES SECTION ---------------- */}
       <section id="about" className="py-20 bg-gradient-to-b from-blue-100 via-blue-50 to-white">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <FadeInWhenVisible>
            <h2 className="text-3xl font-bold text-slate-800 transition-all duration-300 hover:scale-105 cursor-default">Why LearnOne?</h2>
            <p className="text-slate-600 mt-3 text-lg">
              Real tutors. Real results. Learn at your own pace, anywhere.
            </p>
          </FadeInWhenVisible>

          <div className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-8">
            {[
              { icon: "🎯", title: "Live Tutoring" },
              { icon: "👩‍🏫", title: "Expert-Led Courses" },
              { icon: "💼", title: "Career-Focused Skills" },
              { icon: "📚", title: "Personalized Learning" },
              { icon: "⏰", title: "Learn Anytime, Anywhere" },
              { icon: "🌐", title: "Join a Global Community" },
            ].map((f, i) => (
              <FadeInWhenVisible key={i} delay={i * 0.2}>
                <motion.div
                  whileHover={{ y: -14, scale: 1.03 }}
                  transition={{ type: 'spring', stiffness: 260, damping: 22 }}
                  className="feature-card p-6 rounded-xl"
                >
                  <div className="text-4xl icon-container w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">{f.icon}</div>
                  <h3 className="mt-3 text-lg">{f.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed">
                    LearnOne brings students and tutors together for live, focused
                    learning sessions designed around your goals.
                  </p>
                </motion.div>
              </FadeInWhenVisible>
            ))}
          </div>
        </div>
      </section>

       {/* ---------------- HOW IT WORKS ---------------- */}

       <section className="bg-gradient-to-b from-white via-blue-50 to-blue-100 py-20">
        <div className="max-w-6xl mx-auto px-6 text-center">
          <FadeInWhenVisible>
            <h2 className="text-3xl font-bold text-slate-800 transition-all duration-300 hover:scale-105 cursor-default">How It Works</h2>
          </FadeInWhenVisible>

          <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                step: "1",
                title: "Sign Up",
                desc: "Create your free account in seconds and set your learning goals.",
              },
              {
                step: "2",
                title: "Find a Tutor",
                desc: "Browse qualified tutors and subjects that fit your needs.",
              },
              {
                step: "3",
                title: "Learn Live",
                desc: "Join interactive sessions and track progress over time.",
              },
            ].map((s, i) => (
              <FadeInWhenVisible key={i} delay={i * 0.2}>
                  <motion.div
                    whileHover={{ y: -14, scale: 1.03 }}
                    transition={{ type: 'spring', stiffness: 260, damping: 22 }}
                    className="warm-card p-6 rounded-xl"
                  >
                  <div className="text-4xl font-bold step-number w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">{s.step}</div>
                  <h3 className="mt-3 text-lg">{s.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed">{s.desc}</p>
                </motion.div>
              </FadeInWhenVisible>
            ))}
          </div>
        </div>
      </section>

       {/* ---------------- POPULAR COURSES ---------------- */}
       <section id="courses" className="py-20 bg-gradient-to-b from-blue-100 via-white to-blue-50">
        <FadeInWhenVisible>
          <div className="max-w-7xl mx-auto px-6">
              <div className="flex flex-col items-center mb-8">
              <h2 className="text-3xl font-bold text-slate-800 transition-all duration-300 hover:scale-105 cursor-default">Popular Courses</h2>
            </div>

            {filteredCourses.length === 0 ? (
              <p className="text-center text-slate-500">
                No courses match your search.
              </p>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredCourses.map((course, i) => (
                    <FadeInWhenVisible key={course.id} delay={i * 0.15}>
                      <motion.div
                        whileHover={{ y: -14, scale: 1.02 }}
                        transition={{ type: 'spring', stiffness: 260, damping: 22 }}
                        className="course-card rounded-xl overflow-hidden h-full flex flex-col"
                      >
                        <img
                          src={course.thumbnail}
                          alt={course.title}
                          loading="lazy"
                          className="w-full h-44 object-cover transition-transform duration-300 hover:scale-110"
                        />
                        <div className="p-6 flex flex-col flex-grow">
                          <h3 className="font-semibold text-lg mb-4">
                            {course.title}
                          </h3>
                          <div className="mt-auto">
                            <Link
                              to={`/course/${course.id}`}
                              className="w-full block text-center px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 shadow-sm hover:shadow-md enroll-btn"
                            >
                              Enroll Now
                            </Link>
                          </div>
                        </div>
                      </motion.div>
                    </FadeInWhenVisible>
                  ))}
                </div>

                {/* single View All CTA at bottom of section */}
                <div className="mt-8 flex justify-center">
                  <Link
                    to="/courses"
                     className="inline-block bg-blue-500 text-white px-6 py-3 rounded-md font-semibold shadow transform transition duration-200 hover:scale-105 hover:-translate-y-1 hover:shadow-lg active:scale-95 hover:from-blue-700 hover:to-blue-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                    aria-label="View all courses"
                    aria-pressed="false"
                  >
                    View All Courses
                  </Link>
                </div>
              </>
            )}
          </div>
        </FadeInWhenVisible>
      </section>

      {/* ---------------- TESTIMONIALS ---------------- */}
      <FadeInWhenVisible>
         <section id="testimonials" className="bg-gradient-to-b from-blue-50 via-blue-100 to-white py-20">
          <div className="max-w-6xl mx-auto px-6 text-center">
            <h2 className="text-3xl font-bold text-slate-800 transition-all duration-300 hover:scale-105 cursor-default">What Students Say</h2>

            {/* Testimonials Carousel */}
            <div className="mt-10 overflow-hidden">
              <motion.div 
                className="flex gap-8"
                animate={{ x: `calc(-${currentIndex * (100 / 3)}%)` }}
                transition={{ 
                  type: "tween", 
                  ease: "easeInOut",
                  duration: 0.6
                }}
              >
                {[
                  {
                    name: "Sarah M.",
                    avatar: "/avatars/sarah.jpg",
                    text: "LearnOne helped me ace my SATs with personalized sessions. Highly recommend!",
                  },
                  {
                    name: "David R.",
                    avatar: "/avatars/david.jpg",
                    text: "The tutors are excellent — they really know how to make tough topics simple.",
                  },
                  {
                    name: "Priya K.",
                    avatar: "/avatars/priya.jpg",
                    text: "Affordable, convenient, and interactive! My go-to for live learning.",
                  },
                  {
                    name: "James W.",
                    avatar: "/avatars/james.jpg",
                    text: "The best investment I've made in my education. Quality is outstanding!",
                  },
                  {
                    name: "Maria G.",
                    avatar: "/avatars/maria.jpg",
                    text: "Flexible schedule and amazing tutors. Learning has never been this enjoyable!",
                  },
                  {
                    name: "Alex T.",
                    avatar: "/avatars/alex.jpg",
                    text: "Perfect platform for students who want to excel. Highly satisfied!",
                  },
                ].map((t, i) => (
                  <div key={i} className="min-w-[calc(33.333%-1.33rem)]">
                    <motion.div 
                      whileHover={{ y: -12, scale: 1.02 }} 
                      transition={{ type: 'spring', stiffness: 260, damping: 22 }} 
                      className="testimonial-card p-6 rounded-xl h-full"
                    >
                      <div className="flex items-center gap-4">
                        <img
                          src={t.avatar}
                          alt={`${t.name} avatar`}
                          className="w-14 h-14 rounded-full object-cover bg-gray-200"
                          onError={(e) => {
                            e.currentTarget.onerror = null;
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                        <div className="text-left">
                          <h4 className="font-semibold">{t.name}</h4>
                          <p className="italic mt-2 leading-relaxed">"{t.text}"</p>
                        </div>
                      </div>
                    </motion.div>
                  </div>
                ))}
              </motion.div>
            </div>

            {/* Navigation Dots */}
            <div className="flex justify-center gap-1.5 mt-6">
              {[0, 1, 2, 3].map((index) => (
                <button
                  key={index}
                  onClick={() => setCurrentIndex(index)}
                  className={`w-1 h-1 rounded-full transition-all duration-200 border-0 p-0 shadow-none hover:shadow-none ${
                    currentIndex === index 
                      ? 'bg-blue-600' 
                      : 'bg-blue-300 hover:bg-blue-400'
                  }`}
                  style={{
                    borderRadius: '50%',
                    minWidth: '4px',
                    minHeight: '4px',
                    width: '4px',
                    height: '4px'
                  }}
                />
              ))}
            </div>

            {/* Metrics row */}
            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-6">
              <div className="warm-card px-6 py-4 rounded-lg">
                <div className="text-2xl font-bold text-white">1,000+</div>
                <div className="text-sm text-white/90">learners</div>
              </div>
              <div className="warm-card px-6 py-4 rounded-lg">
                <div className="text-2xl font-bold text-white">4.9/5</div>
                <div className="text-sm text-white/90">average rating</div>
              </div>
            </div>
          </div>
        </section>
      </FadeInWhenVisible>

       {/* ---------------- CALL TO ACTION ---------------- */}
       <FadeInWhenVisible>
         <section className="py-20 text-center bg-gradient-to-b from-white via-blue-50 to-blue-100">
          <div className="max-w-3xl mx-auto bg-white border-4 border-blue-500 text-blue-700 rounded-3xl p-12 shadow-2xl relative overflow-hidden backdrop-blur-md">
            {/* Background decoration with depth */}
            <div className="absolute inset-0 bg-gradient-to-br from-blue-100/40 via-transparent to-blue-200/30 rounded-3xl"></div>
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-300/30 rounded-full -translate-y-16 translate-x-16"></div>
            <div className="absolute bottom-0 left-0 w-24 h-24 bg-blue-400/30 rounded-full translate-y-12 -translate-x-12"></div>
            
            {/* Content */}
            <div className="relative z-10">
              <h3 className="text-4xl font-bold mb-4 text-blue-800">
                Ready to Learn as One?
              </h3>
              <p className="mt-4 text-blue-600 text-lg mb-8">
                Join thousands of learners improving their skills every day.
              </p>
              <Link
                to="/login"
                className="inline-block px-14 py-6 bg-gradient-to-r from-blue-600 to-blue-700 text-white font-bold rounded-xl shadow-lg hover:shadow-xl hover:scale-105 hover:text-white transition-all duration-300 hover:from-blue-700 hover:to-blue-800 text-xl"
              >
                Join LearnOne for Free!
              </Link>
            </div>
          </div>
        </section>
      </FadeInWhenVisible>

        {/* ---------------- FOOTER ---------------- */}
       <footer className="bg-gradient-to-b from-blue-500 via-blue-700 via-blue-50 to-blue-700 text-white py-12 border-t-2 border-blue-200">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-8">
            <div>
              <h5 className="text-white font-semibold mb-3">Company</h5>
              <ul className="space-y-2 text-sm">
                <li><a href="/about" className="hover:underline">About Us</a></li>
                <li><a href="/careers" className="hover:underline">Careers</a></li>
                <li><a href="/blog" className="hover:underline">Blog</a></li>
              </ul>
            </div>

            <div>
              <h5 className="text-white font-semibold mb-3">Quick Links</h5>
              <ul className="space-y-2 text-sm">
                <li><a href="/courses" className="hover:underline">Courses</a></li>
                <li><a href="/pricing" className="hover:underline">Pricing</a></li>
                <li><a href="/login" className="hover:underline">LogIn</a></li>
              </ul>
            </div>

            <div>
              <h5 className="text-white font-semibold mb-3">Support</h5>
              <ul className="space-y-2 text-sm">
                <li><a href="/faqs" className="hover:underline">FAQs</a></li>
                <li><a href="/terms" className="hover:underline">Terms & Policy</a></li>
                <li><a href="/contact" className="hover:underline">Contact</a></li>
                <li><a href="/refund" className="hover:underline">Refund Policy</a></li>
              </ul>
            </div>

            <div>
              <h5 className="text-white font-semibold mb-3">Connect</h5>
              <p className="text-sm">support@learnone.example</p>
              <div className="mt-4 flex items-center gap-3">
                <a href="#" className="p-2 bg-blue-700 rounded-full hover:bg-blue-600 transition-colors">Twitter</a>
                <a href="#" className="p-2 bg-blue-700 rounded-full hover:bg-blue-600 transition-colors">LinkedIn</a>
                <a href="#" className="p-2 bg-blue-700 rounded-full hover:bg-blue-600 transition-colors">YouTube</a>
              </div>
            </div>
          </div>

           <div className="mt-8 border-t border-blue-300 pt-6 text-sm text-white flex flex-col md:flex-row items-center justify-between">
            <div>© {new Date().getFullYear()} LearnOne. All rights reserved.</div>
            <div className="mt-3 md:mt-0">Made with ♥ for learners.</div>
          </div>
        </div>
      </footer>
    </div>
  );
}
