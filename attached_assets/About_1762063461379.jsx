import React from "react";
import { motion } from "framer-motion";
import { Users, Target, Award, Heart } from "lucide-react";
import FadeInWhenVisible from "../components/FadeInWhenVisible";

export default function About() {
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
              About <span className="bg-gradient-to-r from-blue-600 via-blue-700 to-blue-800 bg-clip-text text-transparent">LearnOne</span>
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1 }}
              className="text-lg md:text-xl text-slate-600 max-w-3xl mx-auto"
            >
              Empowering learners of all ages with comprehensive, hands-on education in technology and programming.
            </motion.p>
          </div>
        </div>
      </section>

      {/* Mission Section */}
      <section className="py-20 bg-gradient-to-b from-blue-100 via-blue-50 to-white">
        <div className="max-w-7xl mx-auto px-6">
          <FadeInWhenVisible>
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold text-slate-800 mb-6">Our Mission</h2>
              <p className="text-lg text-slate-600 max-w-4xl mx-auto leading-relaxed">
                At LearnOne, we believe that technology education should be accessible, engaging, and practical. 
                We're committed to providing students with the skills they need to thrive in an increasingly digital world, 
                from foundational programming concepts to advanced AI and machine learning.
              </p>
            </div>
          </FadeInWhenVisible>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            <FadeInWhenVisible delay={0.1}>
              <div className="text-center p-6 bg-white rounded-2xl shadow-lg border border-blue-200 h-full">
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Users className="w-8 h-8 text-blue-600" />
                </div>
                <h3 className="text-xl font-bold text-slate-800 mb-2">Student-Focused</h3>
                <p className="text-slate-600">Designed with learners in mind, from elementary to college level.</p>
              </div>
            </FadeInWhenVisible>

            <FadeInWhenVisible delay={0.2}>
              <div className="text-center p-6 bg-white rounded-2xl shadow-lg border border-blue-200 h-full">
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Target className="w-8 h-8 text-blue-600" />
                </div>
                <h3 className="text-xl font-bold text-slate-800 mb-2">Practical Learning</h3>
                <p className="text-slate-600">Real-world projects and hands-on experience with industry tools.</p>
              </div>
            </FadeInWhenVisible>

            <FadeInWhenVisible delay={0.3}>
              <div className="text-center p-6 bg-white rounded-2xl shadow-lg border border-blue-200 h-full">
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Award className="w-8 h-8 text-blue-600" />
                </div>
                <h3 className="text-xl font-bold text-slate-800 mb-2">Expert Instructors</h3>
                <p className="text-slate-600">Learn from experienced professionals and educators.</p>
              </div>
            </FadeInWhenVisible>

            <FadeInWhenVisible delay={0.4}>
              <div className="text-center p-6 bg-white rounded-2xl shadow-lg border border-blue-200 h-full">
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Heart className="w-8 h-8 text-blue-600" />
                </div>
                <h3 className="text-xl font-bold text-slate-800 mb-2">Supportive Community</h3>
                <p className="text-slate-600">Join a community of learners and mentors who care about your success.</p>
              </div>
            </FadeInWhenVisible>
          </div>
        </div>
      </section>

      {/* Our Story Section */}
      <section className="py-20 bg-gradient-to-b from-white via-blue-50 to-blue-100">
        <div className="max-w-7xl mx-auto px-6">
          <FadeInWhenVisible>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
              <div>
                <h2 className="text-3xl md:text-4xl font-bold text-slate-800 mb-6">Our Story</h2>
                <p className="text-lg text-slate-600 mb-4 leading-relaxed">
                  Founded with a vision to democratize technology education, LearnOne has been on a mission to make 
                  programming and tech skills accessible to learners of all ages and backgrounds. We recognized the 
                  growing gap between traditional education and the rapidly evolving tech industry.
                </p>
                <p className="text-lg text-slate-600 mb-4 leading-relaxed">
                  What started as a small initiative has grown into a comprehensive platform serving thousands of students 
                  worldwide. Our commitment to hands-on learning, practical projects, and real-world applications sets 
                  us apart in the online education space.
                </p>
                <p className="text-lg text-slate-600 leading-relaxed">
                  Today, we're proud to offer courses spanning from foundational programming to cutting-edge AI and machine 
                  learning, ensuring that every student has the tools they need to succeed in the digital age.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div className="bg-white rounded-2xl p-6 shadow-lg border border-blue-200">
                  <div className="text-4xl font-bold text-blue-600 mb-2">10K+</div>
                  <div className="text-slate-600">Students Served</div>
                </div>
                <div className="bg-white rounded-2xl p-6 shadow-lg border border-blue-200">
                  <div className="text-4xl font-bold text-blue-600 mb-2">500+</div>
                  <div className="text-slate-600">Active Courses</div>
                </div>
                <div className="bg-white rounded-2xl p-6 shadow-lg border border-blue-200">
                  <div className="text-4xl font-bold text-blue-600 mb-2">50+</div>
                  <div className="text-slate-600">Expert Instructors</div>
                </div>
                <div className="bg-white rounded-2xl p-6 shadow-lg border border-blue-200">
                  <div className="text-4xl font-bold text-blue-600 mb-2">95%</div>
                  <div className="text-slate-600">Success Rate</div>
                </div>
              </div>
            </div>
          </FadeInWhenVisible>
        </div>
      </section>

      {/* Why Choose Us Section */}
      <section className="py-20 bg-gradient-to-b from-blue-100 via-white to-blue-50">
        <div className="max-w-7xl mx-auto px-6">
          <FadeInWhenVisible>
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold text-slate-800 mb-6">Why Choose LearnOne?</h2>
              <p className="text-lg text-slate-600 max-w-3xl mx-auto">
                We've designed our platform with your success in mind. Here's what makes us different:
              </p>
            </div>
          </FadeInWhenVisible>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            <FadeInWhenVisible delay={0.1}>
              <div className="bg-white rounded-2xl p-8 shadow-lg border border-blue-200 h-full">
                <div className="text-3xl mb-4">🎓</div>
                <h3 className="text-xl font-bold text-slate-800 mb-3">Age-Appropriate Curriculum</h3>
                <p className="text-slate-600">
                  Our courses are carefully designed for different age groups, from elementary to college, ensuring 
                  that content is both engaging and accessible.
                </p>
              </div>
            </FadeInWhenVisible>

            <FadeInWhenVisible delay={0.2}>
              <div className="bg-white rounded-2xl p-8 shadow-lg border border-blue-200 h-full">
                <div className="text-3xl mb-4">🏆</div>
                <h3 className="text-xl font-bold text-slate-800 mb-3">Project-Based Learning</h3>
                <p className="text-slate-600">
                  Every course culminates in a capstone project, giving students hands-on experience and 
                  a portfolio of work to showcase their skills.
                </p>
              </div>
            </FadeInWhenVisible>

            <FadeInWhenVisible delay={0.3}>
              <div className="bg-white rounded-2xl p-8 shadow-lg border border-blue-200 h-full">
                <div className="text-3xl mb-4">🚀</div>
                <h3 className="text-xl font-bold text-slate-800 mb-3">Industry-Relevant Skills</h3>
                <p className="text-slate-600">
                  We teach the tools and technologies used by professionals today, preparing students 
                  for real-world challenges and career opportunities.
                </p>
              </div>
            </FadeInWhenVisible>

            <FadeInWhenVisible delay={0.4}>
              <div className="bg-white rounded-2xl p-8 shadow-lg border border-blue-200 h-full">
                <div className="text-3xl mb-4">👥</div>
                <h3 className="text-xl font-bold text-slate-800 mb-3">Personalized Support</h3>
                <p className="text-slate-600">
                  Get help when you need it. Our instructors and community are always ready to assist 
                  you on your learning journey.
                </p>
              </div>
            </FadeInWhenVisible>

            <FadeInWhenVisible delay={0.5}>
              <div className="bg-white rounded-2xl p-8 shadow-lg border border-blue-200 h-full">
                <div className="text-3xl mb-4">💡</div>
                <h3 className="text-xl font-bold text-slate-800 mb-3">Flexible Learning</h3>
                <p className="text-slate-600">
                  Learn at your own pace, on your own schedule. Our platform adapts to your lifestyle 
                  and commitments.
                </p>
              </div>
            </FadeInWhenVisible>

            <FadeInWhenVisible delay={0.6}>
              <div className="bg-white rounded-2xl p-8 shadow-lg border border-blue-200 h-full">
                <div className="text-3xl mb-4">🌟</div>
                <h3 className="text-xl font-bold text-slate-800 mb-3">Continuous Updates</h3>
                <p className="text-slate-600">
                  Our courses evolve with technology. We regularly update content to reflect the latest 
                  industry trends and best practices.
                </p>
              </div>
            </FadeInWhenVisible>
          </div>
        </div>
      </section>

      {/* Values Section */}
      <section className="py-20 bg-gradient-to-b from-blue-50 via-blue-100 to-white">
        <div className="max-w-7xl mx-auto px-6">
          <FadeInWhenVisible>
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold text-slate-800 mb-6">Our Core Values</h2>
            </div>
          </FadeInWhenVisible>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto">
            <FadeInWhenVisible delay={0.1}>
              <div className="bg-white rounded-2xl p-8 shadow-lg border border-blue-200 h-full">
                <h3 className="text-2xl font-bold text-slate-800 mb-3">🧠 Accessibility</h3>
                <p className="text-slate-600 leading-relaxed">
                  We believe quality education should be accessible to everyone, regardless of their background, 
                  location, or financial situation. This drives our pricing strategy and course design.
                </p>
              </div>
            </FadeInWhenVisible>

            <FadeInWhenVisible delay={0.2}>
              <div className="bg-white rounded-2xl p-8 shadow-lg border border-blue-200 h-full">
                <h3 className="text-2xl font-bold text-slate-800 mb-3">🎯 Excellence</h3>
                <p className="text-slate-600 leading-relaxed">
                  We're committed to maintaining the highest standards in our curriculum, instruction, and 
                  student support. Mediocrity is not in our vocabulary.
                </p>
              </div>
            </FadeInWhenVisible>

            <FadeInWhenVisible delay={0.3}>
              <div className="bg-white rounded-2xl p-8 shadow-lg border border-blue-200 h-full">
                <h3 className="text-2xl font-bold text-slate-800 mb-3">🤝 Community</h3>
                <p className="text-slate-600 leading-relaxed">
                  Learning happens best in a supportive community. We foster connections between students, 
                  instructors, and alumni to create a collaborative learning environment.
                </p>
              </div>
            </FadeInWhenVisible>

            <FadeInWhenVisible delay={0.4}>
              <div className="bg-white rounded-2xl p-8 shadow-lg border border-blue-200 h-full">
                <h3 className="text-2xl font-bold text-slate-800 mb-3">📈 Growth</h3>
                <p className="text-slate-600 leading-relaxed">
                  We're constantly learning and evolving. We stay up-to-date with technology trends and 
                  continuously improve our courses based on student feedback.
                </p>
              </div>
            </FadeInWhenVisible>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-b from-white via-blue-50 to-blue-100">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <FadeInWhenVisible>
            <div className="bg-white border-4 border-blue-500 text-blue-700 rounded-3xl p-12 shadow-2xl relative overflow-hidden backdrop-blur-md">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-100/40 via-transparent to-blue-200/30 rounded-3xl"></div>
              <div className="absolute top-0 right-0 w-32 h-32 bg-blue-300/30 rounded-full -translate-y-16 translate-x-16"></div>
              <div className="absolute bottom-0 left-0 w-24 h-24 bg-blue-400/30 rounded-full translate-y-12 -translate-x-12"></div>
              
              <div className="relative z-10">
                <h3 className="text-4xl font-bold mb-4 text-blue-800">
                  Ready to Start Learning?
                </h3>
                <p className="mt-4 text-blue-600 text-lg mb-8">
                  Join thousands of students who are already building their futures with LearnOne. 
                  Start your journey today!
                </p>
                <a
                  href="/courses"
                  className="inline-block px-10 py-5 bg-gradient-to-r from-blue-600 to-blue-700 text-white font-bold rounded-xl shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-300 hover:from-blue-700 hover:to-blue-800"
                >
                  Explore Our Courses
                </a>
              </div>
            </div>
          </FadeInWhenVisible>
        </div>
      </section>
    </div>
  );
}
