import { useState, useRef, useCallback } from 'react';

interface UseVoiceRecorderOptions {
    onStop?: (blob: Blob) => void;
    onError?: (error: Error) => void;
}

export const useVoiceRecorder = (options: UseVoiceRecorderOptions = {}) => {
    const [isRecording, setIsRecording] = useState(false);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);

    const startRecording = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

            // Prioritize higher quality, industry-standard codecs
            const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                ? 'audio/webm;codecs=opus'
                : 'audio/webm';

            const mediaRecorder = new MediaRecorder(stream, { mimeType });
            mediaRecorderRef.current = mediaRecorder;
            chunksRef.current = [];

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunksRef.current.push(e.data);
            };

            mediaRecorder.onstop = () => {
                // Ensure we use the same mimeType for the blob
                const blob = new Blob(chunksRef.current, { type: mimeType });
                options.onStop?.(blob);
                stream.getTracks().forEach(track => track.stop());
            };

            mediaRecorder.start();
            setIsRecording(true);
        } catch (err: any) {
            console.error('Recording initialization failed:', err);
            options.onError?.(err);
            setIsRecording(false);
        }
    }, [options]);

    const stopRecording = useCallback(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
        }
    }, []);

    return {
        isRecording,
        startRecording,
        stopRecording,
        isSupported: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)
    };
};
