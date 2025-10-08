import React, { useContext, useEffect, useRef, useState } from "react";
import { userDataContext } from "../context/UserContext";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import aiImg from "../assets/ai.gif";
import { CgMenuRight } from "react-icons/cg";
import { RxCross1 } from "react-icons/rx";
import userImg from "../assets/user.gif";

function Home() {
  const { userData, serverUrl, setUserData, getGeminiResponse } =
    useContext(userDataContext);
  const navigate = useNavigate();

  const [listening, setListening] = useState(false);
  const [userText, setUserText] = useState("");
  const [aiText, setAiText] = useState("");
  const [ham, setHam] = useState(false);

  const recognitionRef = useRef(null);
  const isSpeakingRef = useRef(false);
  const isRecognizingRef = useRef(false);
  const synth = window.speechSynthesis;

  // ✅ Log out safely
  const handleLogOut = async () => {
    try {
      await axios.get(`${serverUrl}/api/auth/logout`, { withCredentials: true });
    } catch (error) {
      console.log(error);
    } finally {
      setUserData(null);
      navigate("/signin");
    }
  };

  // ✅ Safe link opener
  const openInNewTab = (url) => {
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // ✅ Speech recognition starter
  const startRecognition = () => {
    if (
      recognitionRef.current &&
      !isSpeakingRef.current &&
      !isRecognizingRef.current
    ) {
      try {
        recognitionRef.current.start();
        console.log("Recognition started");
      } catch (error) {
        if (error.name !== "InvalidStateError") console.error(error);
      }
    }
  };

  // ✅ Speak, then callback
  const speak = (text, onDone) => {
    if (!text) {
      if (onDone) onDone();
      return;
    }

    if (recognitionRef.current) recognitionRef.current.stop();
    synth.cancel();

    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = "hi-IN";

    const voices = synth.getVoices();
    const hindiVoice = voices.find((v) => v.lang === "hi-IN");
    if (hindiVoice) utter.voice = hindiVoice;

    isSpeakingRef.current = true;

    utter.onend = () => {
      isSpeakingRef.current = false;
      setAiText("");
      if (onDone) onDone();
      setTimeout(() => startRecognition(), 800);
    };

    synth.speak(utter);
  };

  // ✅ Handle Gemini command responses
  const handleCommand = (data) => {
    if (!data) return;
    const { type, userInput, response } = data;

    let url = null;
    switch (type) {
      case "google-search":
        url = `https://www.google.com/search?q=${encodeURIComponent(userInput)}`;
        break;
      case "calculator-open":
        url = `https://www.google.com/search?q=calculator`;
        break;
      case "instagram-open":
        url = `https://www.instagram.com/`;
        break;
      case "facebook-open":
        url = `https://www.facebook.com/`;
        break;
      case "weather-show":
        url = `https://www.google.com/search?q=weather`;
        break;
      case "youtube-search":
      case "youtube-play":
        url = `https://www.youtube.com/results?search_query=${encodeURIComponent(
          userInput
        )}`;
        break;
      default:
        url = null;
    }

    speak(response, () => {
      if (url) openInNewTab(url);
    });
  };

  // ✅ Initialize voice list (fix for getVoices issue)
  useEffect(() => {
    const preloadVoices = () => {
      synth.getVoices();
    };
    synth.addEventListener("voiceschanged", preloadVoices);
    preloadVoices();
    return () => {
      synth.removeEventListener("voiceschanged", preloadVoices);
    };
  }, [synth]);

  // ✅ Voice recognition logic
  useEffect(() => {
    if (!window.SpeechRecognition && !window.webkitSpeechRecognition) {
      console.warn("Speech recognition not supported in this browser.");
      return;
    }

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognitionRef.current = recognition;

    let isMounted = true;

    const startTimeout = setTimeout(() => {
      if (isMounted && !isSpeakingRef.current && !isRecognizingRef.current) {
        startRecognition();
      }
    }, 1000);

    recognition.onstart = () => {
      isRecognizingRef.current = true;
      setListening(true);
      console.log("Recognition active");
    };

    recognition.onend = () => {
      isRecognizingRef.current = false;
      setListening(false);
      if (isMounted && !isSpeakingRef.current) {
        setTimeout(() => startRecognition(), 1000);
      }
    };

    recognition.onerror = (event) => {
      console.warn("Recognition error:", event.error);
      isRecognizingRef.current = false;
      setListening(false);
      if (event.error !== "aborted" && isMounted && !isSpeakingRef.current) {
        setTimeout(() => startRecognition(), 1000);
      }
    };

    recognition.onresult = async (e) => {
      const transcript = e.results[e.results.length - 1][0].transcript.trim();
      console.log("Heard:", transcript);

      if (
        userData?.assistantName &&
        transcript.toLowerCase().includes(userData.assistantName.toLowerCase())
      ) {
        recognition.stop();
        isRecognizingRef.current = false;
        setListening(false);
        setAiText("");
        setUserText(transcript);

        try {
          const data = await getGeminiResponse(transcript);
          console.log("Gemini response:", data);
          handleCommand(data);
          setAiText(data.response);
        } catch (err) {
          console.error("AI response error:", err);
        } finally {
          setUserText("");
        }
      }
    };

    // 🗣️ Initial greeting
    if (userData?.name) {
      const greet = new SpeechSynthesisUtterance(
        `Hello ${userData.name}, what can I help you with?`
      );
      greet.lang = "hi-IN";
      isSpeakingRef.current = true;
      greet.onend = () => {
        isSpeakingRef.current = false;
        startRecognition();
      };
      synth.speak(greet);
    } else {
      startRecognition();
    }

    // ✅ Cleanup
    return () => {
      isMounted = false;
      clearTimeout(startTimeout);
      if (recognitionRef.current) recognitionRef.current.stop();
      synth.cancel();
      setListening(false);
      isRecognizingRef.current = false;
    };
  }, [userData, getGeminiResponse, synth]);

  // ✅ UI
  return (
    <div className="w-full h-[100vh] bg-gradient-to-t from-black to-[#045004] flex justify-center items-center flex-col gap-[15px] overflow-hidden relative">
      {/* Mobile hamburger */}
      <CgMenuRight
        className="lg:hidden text-white absolute top-[20px] right-[20px] w-[25px] h-[25px] cursor-pointer"
        onClick={() => setHam(true)}
      />

      {/* Mobile menu */}
      <div
        className={`absolute lg:hidden top-0 w-full h-full bg-[#00000053] backdrop-blur-lg p-[20px] flex flex-col gap-[20px] items-start transition-transform duration-300 ${
          ham ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <RxCross1
          className="text-white absolute top-[20px] right-[20px] w-[25px] h-[25px] cursor-pointer"
          onClick={() => setHam(false)}
        />
        <button
          className="min-w-[150px] h-[60px] text-black font-semibold bg-white rounded-full cursor-pointer text-[19px]"
          onClick={handleLogOut}
        >
          Log Out
        </button>
        <button
          className="min-w-[150px] h-[60px] text-black font-semibold bg-white rounded-full cursor-pointer text-[19px] px-[20px] py-[10px]"
          onClick={() => navigate("/customize")}
        >
          Customize your Assistant
        </button>

        <div className="w-full h-[2px] bg-gray-400"></div>
        <h1 className="text-white font-semibold text-[19px]">History</h1>

        <div className="w-full h-[400px] gap-[20px] overflow-y-auto flex flex-col truncate">
          {userData?.history?.length > 0 ? (
            userData.history.map((his, i) => (
              <div
                key={i}
                className="text-gray-200 text-[18px] w-full h-[30px]"
              >
                {his}
              </div>
            ))
          ) : (
            <p className="text-gray-400 text-[16px]">No history yet.</p>
          )}
        </div>
      </div>

      {/* Desktop buttons */}
      <button
        className="min-w-[150px] h-[60px] mt-[30px] text-white font-semibold absolute hidden lg:block top-[20px] right-[20px] bg-gradient-to-r from-[#04501c] to-[#26bb26] shadow-lg shadow-black rounded-full cursor-pointer text-[19px]"
        onClick={handleLogOut}
      >
        Log Out
      </button>
      <button
        className="min-w-[150px] h-[60px] mt-[30px] text-white font-semibold bg-gradient-to-r from-[#04501c] to-[#26bb26] shadow-lg shadow-black absolute top-[100px] right-[20px] rounded-full cursor-pointer text-[19px] px-[20px] py-[10px] hidden lg:block"
        onClick={() => navigate("/customize")}
      >
        Customize your Assistant
      </button>

      {/* Assistant display */}
      <div
        key={userData?.assistantImage}
        className="w-[300px] h-[400px] flex justify-center items-center overflow-hidden rounded-4xl shadow-lg"
      >
        {userData?.assistantImage && (
          <img
            src={userData.assistantImage}
            alt="assistant"
            className="h-full object-cover"
          />
        )}
      </div>

      <h1 className="text-white text-[18px] font-semibold">
        I'm {userData?.assistantName || "your assistant"}
      </h1>

      {!aiText ? (
        <img src={userImg} alt="user" className="w-[200px]" />
      ) : (
        <img src={aiImg} alt="ai" className="w-[200px]" />
      )}

      <h1 className="text-white text-[18px] font-semibold text-center px-4 break-words">
        {userText || aiText || ""}
      </h1>
    </div>
  );
}

export default Home;
