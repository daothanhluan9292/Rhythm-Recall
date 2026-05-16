#include <SDL2/SDL.h>
#include <SDL2/SDL_mixer.h>
#include <vector>
#include <iostream>
#include <cmath>
#include <string>
#include <random>

// Cấu hình trò chơi
const int SCREEN_WIDTH = 800;
const int SCREEN_HEIGHT = 600;
const int BPM = 80;
const float BEAT_DUR = 60.0f / BPM;

struct Note {
    float startBeat;
    float len;
    float freq;
};

// Hàm tạo sóng âm đơn giản (Triangle wave)
Mix_Chunk* generateTriangleNote(float freq, float duration) {
    int sampleRate = 44100;
    int length = sampleRate * duration;
    Uint8* buffer = (Uint8*)malloc(length);
    
    for (int i = 0; i < length; i++) {
        float time = (float)i / sampleRate;
        // Công thức sóng tam giác
        float value = 2.0f * (float)fabs(2.0f * (time * freq - floor(time * freq + 0.5f))) - 1.0f;
        buffer[i] = (Uint8)((value + 1.0f) * 127.5f);
    }

    Mix_Chunk* chunk = (Mix_Chunk*)malloc(sizeof(Mix_Chunk));
    chunk->allocated = 1;
    chunk->abuf = buffer;
    chunk->alen = length;
    chunk->volume = 128; // Âm lượng tối đa
    return chunk;
}

std::vector<Note> generateMelody(int numNotes) {
    std::vector<Note> melody;
    float current = 0;
    std::vector<float> pitches = {329.63f, 392.00f, 440.00f, 523.25f, 659.25f};
    
    std::random_device rd;
    std::mt19937 gen(rd());
    std::uniform_int_distribution<> dPitch(0, static_cast<int>(pitches.size() - 1));
    std::uniform_int_distribution<> dLen(1, 2);

    for (int i = 0; i < numNotes; i++) {
        float len = (float)dLen(gen);
        melody.push_back({current, len, pitches[dPitch(gen)]});
        current += len;
    }
    return melody;
}

int main(int argc, char* args[]) {
    if (SDL_Init(SDL_INIT_VIDEO | SDL_INIT_AUDIO) < 0) return -1;
    if (Mix_OpenAudio(44100, MIX_DEFAULT_FORMAT, 2, 2048) < 0) return -1;

    SDL_Window* window = SDL_CreateWindow("Rhythm Recall C++", SDL_WINDOWPOS_UNDEFINED, SDL_WINDOWPOS_UNDEFINED, SCREEN_WIDTH, SCREEN_HEIGHT, SDL_WINDOW_SHOWN);
    SDL_Renderer* renderer = SDL_CreateRenderer(window, -1, SDL_RENDERER_ACCELERATED);

    bool quit = false;
    SDL_Event e;

    std::vector<Note> melody = generateMelody(2);

    while (!quit) {
        while (SDL_PollEvent(&e) != 0) {
            if (e.type == SDL_QUIT) quit = true;
            if (e.type == SDL_MOUSEBUTTONDOWN) {
                // Xử lý logic nhấn chuột tương tự Recall
                std::cout << "Phát âm thanh tần số: " << melody[0].freq << std::endl;
            }
        }

        // Xóa màn hình (Màu đỏ rượu vang như bản gốc)
        SDL_SetRenderDrawColor(renderer, 77, 20, 40, 255);
        SDL_RenderClear(renderer);

        // Vẽ giao diện (Placeholder)
        SDL_Rect trackOutline = { 50, 200, 700, 100 };
        SDL_SetRenderDrawColor(renderer, 255, 255, 255, 50);
        SDL_RenderFillRect(renderer, &trackOutline);

        SDL_RenderPresent(renderer);
    }

    SDL_DestroyRenderer(renderer);
    SDL_DestroyWindow(window);
    Mix_CloseAudio();
    SDL_Quit();

    return 0;
}
