import React, { useState } from "react";
import { motion } from "framer-motion";
import { Mail, Phone, Globe, Send, MessageCircle, Clock } from "lucide-react";
import FadeInWhenVisible from "../components/FadeInWhenVisible";

export default function Contact() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    subject: "",
    message: ""
  });

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    alert("Thank you for your message! We'll get back to you soon.");
    setFormData({ name: "", email: "", subject: "", message: "" });
  };

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
              Get in <span className="bg-gradient-to-r from-blue-600 via-blue-700 to-blue-800 bg-clip-text text-transparent">Touch</span>
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1 }}
              className="text-lg md:text-xl text-slate-600 max-w-3xl mx-auto"
            >
              Have questions about our courses? Need help choosing the right program? We're here to help!
            </motion.p>
          </div>
        </div>
      </section>

      {/* Contact Information */}
      <section className="py-20 bg-gradient-to-b from-blue-100 via-blue-50 to-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            {/* Contact Form */}
            <FadeInWhenVisible>
              <div className="bg-white rounded-2xl p-8 shadow-lg border border-blue-200">
                <h2 className="text-2xl font-bold text-slate-800 mb-6">Send us a Message</h2>
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div>
                    <label htmlFor="name" className="block text-sm font-medium text-slate-700 mb-2">
                      Full Name
                    </label>
                    <input
                      type="text"
                      id="name"
                      name="name"
                      value={formData.name}
                      onChange={handleInputChange}
                      required
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Your full name"
                    />
                  </div>

                  <div>
                    <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-2">
                      Email Address
                    </label>
                    <input
                      type="email"
                      id="email"
                      name="email"
                      value={formData.email}
                      onChange={handleInputChange}
                      required
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="your.email@example.com"
                    />
                  </div>

                  <div>
                    <label htmlFor="subject" className="block text-sm font-medium text-slate-700 mb-2">
                      Subject
                    </label>
                    <input
                      type="text"
                      id="subject"
                      name="subject"
                      value={formData.subject}
                      onChange={handleInputChange}
                      required
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="What's this about?"
                    />
                  </div>

                  <div>
                    <label htmlFor="message" className="block text-sm font-medium text-slate-700 mb-2">
                      Message
                    </label>
                    <textarea
                      id="message"
                      name="message"
                      value={formData.message}
                      onChange={handleInputChange}
                      required
                      rows={5}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                      placeholder="Tell us how we can help you..."
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold py-3 px-6 rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all duration-200 hover:scale-105 hover:shadow-lg"
                  >
                    <Send className="w-5 h-5 inline mr-2" />
                    Send Message
                  </button>
                </form>
              </div>
            </FadeInWhenVisible>

            {/* Contact Information */}
            <FadeInWhenVisible delay={0.2}>
              <div className="space-y-8">
                <div>
                  <h2 className="text-2xl font-bold text-slate-800 mb-6">Contact Information</h2>
                  <div className="space-y-6">
                    <div className="flex items-start space-x-4">
                      <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                        <Mail className="w-6 h-6 text-blue-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-slate-800">Email</h3>
                        <p className="text-slate-600">elearningscenter@gmail.com</p>
                      </div>
                    </div>

                    <div className="flex items-start space-x-4">
                      <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                        <Phone className="w-6 h-6 text-blue-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-slate-800">Phone</h3>
                        <p className="text-slate-600">+1 (720) 234-6452</p>
                        <p className="text-slate-600">+977 9762119277</p>
                      </div>
                    </div>

                    <div className="flex items-start space-x-4">
                      <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                        <Globe className="w-6 h-6 text-blue-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-slate-800">Website</h3>
                        <p className="text-slate-600">www.learningcenter.dev</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Response Time */}
                <div className="bg-white rounded-2xl p-6 shadow-lg border border-blue-200">
                  <div className="flex items-center space-x-3 mb-4">
                    <Clock className="w-6 h-6 text-blue-600" />
                    <h3 className="font-semibold text-slate-800">Response Time</h3>
                  </div>
                  <p className="text-slate-600 text-sm">
                    We typically respond to inquiries within 24 hours during business days. 
                    For urgent matters, please call us directly.
                  </p>
                </div>

                {/* Live Chat */}
                <div className="bg-white rounded-2xl p-6 shadow-lg border border-blue-200">
                  <div className="flex items-center space-x-3 mb-4">
                    <MessageCircle className="w-6 h-6 text-blue-600" />
                    <h3 className="font-semibold text-slate-800">Live Chat</h3>
                  </div>
                  <p className="text-slate-600 text-sm mb-4">
                    Need immediate assistance? Our live chat is available during business hours.
                  </p>
                  <button className="bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold py-2 px-4 rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all duration-200">
                    Start Chat
                  </button>
                </div>
              </div>
            </FadeInWhenVisible>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-20 bg-gradient-to-b from-white via-blue-50 to-blue-100">
        <div className="max-w-4xl mx-auto px-6">
          <FadeInWhenVisible>
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold text-slate-800 mb-4">Frequently Asked Questions</h2>
              <p className="text-slate-600">Quick answers to common questions</p>
            </div>
          </FadeInWhenVisible>

          <div className="space-y-6">
            <FadeInWhenVisible delay={0.1}>
              <div className="bg-white rounded-2xl p-6 shadow-lg border border-blue-200">
                <h3 className="font-semibold text-slate-800 mb-2">What age groups do you serve?</h3>
                <p className="text-slate-600">We offer courses for students from Grades 4-8 through college level, with age-appropriate content and teaching methods.</p>
              </div>
            </FadeInWhenVisible>

            <FadeInWhenVisible delay={0.2}>
              <div className="bg-white rounded-2xl p-6 shadow-lg border border-blue-200">
                <h3 className="font-semibold text-slate-800 mb-2">Do I need prior programming experience?</h3>
                <p className="text-slate-600">No! Our courses are designed to start from the basics. We have beginner-friendly courses that assume no prior knowledge.</p>
              </div>
            </FadeInWhenVisible>

            <FadeInWhenVisible delay={0.3}>
              <div className="bg-white rounded-2xl p-6 shadow-lg border border-blue-200">
                <h3 className="font-semibold text-slate-800 mb-2">What technology do I need?</h3>
                <p className="text-slate-600">Most courses can be completed with a standard computer and internet connection. Specific requirements are listed with each course.</p>
              </div>
            </FadeInWhenVisible>
          </div>
        </div>
      </section>
    </div>
  );
}
